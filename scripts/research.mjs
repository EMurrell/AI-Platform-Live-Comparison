import { readFile, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mergeResearch } from "./data-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "data/current.json");
const pendingPath = path.join(root, "data/pending-price-review.json");
const current = JSON.parse(await readFile(dataPath, "utf8"));
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-5.6-sol";

if (!apiKey) {
  console.error("OPENAI_API_KEY is required. No files were changed.");
  process.exit(1);
}

const timestamp = new Date().toISOString();

function responseText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output ?? [])
    .flatMap(item => item.content ?? [])
    .filter(item => item.type === "output_text")
    .map(item => item.text)
    .join("");
}

function schemaFor(attributes) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["cells"],
    properties: {
      cells: {
        type: "array",
        minItems: attributes.length,
        maxItems: attributes.length,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["attribute", "value", "display", "source_url", "sources", "confidence", "note"],
          properties: {
            attribute: { type: "string", enum: attributes.map(attribute => attribute.id) },
            value: {},
            display: { type: "string", minLength: 1 },
            source_url: { type: "string", minLength: 1 },
            sources: { type: "array", items: { type: "string" } },
            confidence: { type: "string", enum: ["high", "medium", "low", "unverified"] },
            note: { type: "string", minLength: 1 }
          }
        }
      }
    }
  };
}

async function researchProvider(provider) {
  const existing = current.cells.filter(cell => cell.provider === provider.id);
  const prompt = `You are updating a neutral, source-backed comparison for a Canadian non-profit technology consultancy.

Provider: ${provider.name}
Today: ${timestamp.slice(0, 10)}
Official domains allowed: ${provider.official_domains.join(", ")}

Research every attribute below using current official provider pages only:
${current.attributes.map(attribute => `- ${attribute.id}: ${attribute.label} — ${attribute.description}`).join("\n")}

Rules:
- Return exactly one item per attribute.
- Check every item today, even if it appears unchanged.
- source_url and every item in sources must be a direct official URL from an allowed domain.
- Do not use snippets, reseller pages, news articles, community posts or third-party summaries.
- Use unverified confidence when official documentation is ambiguous or contradictory. Use low confidence when a check cannot defend a value. Never guess.
- value must be stable machine-readable JSON; display must be concise plain language.
- For price, report the amount and currency billed to a Canadian customer without converting currencies.
- For price, value must include billing_currency, annual, monthly, promotion, usage and evidence. Use null where a field genuinely does not apply or the vendor does not state the currency.
- annual and monthly must be separate objects containing amount, unit and commitment.
- Distinguish list pricing from promotions. A promotion must include its list amount, promotional amount and end date for each applicable billing cadence.
- evidence must contain the exact quoted vendor text and direct official source URL for every price, currency and promotion figure.
- Prefer locale-pinned Canadian URLs where the vendor provides them.
- Explain material limits, admin dependencies and permissions in note.
- Use Canadian spelling and sentence case. Do not recommend a provider.

Previously confirmed cells:
${JSON.stringify(existing, null, 2)}`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: "medium" },
        tools: [{
          type: "web_search",
          filters: { allowed_domains: provider.official_domains }
        }],
        input: prompt,
        text: {
          format: {
            type: "json_schema",
            name: "provider_research",
            strict: false,
            schema: schemaFor(current.attributes)
          }
        }
      })
    });
    if (!response.ok) throw new Error(`OpenAI API ${response.status}: ${await response.text()}`);
    const payload = await response.json();
    const parsed = JSON.parse(responseText(payload));
    return { provider: provider.id, ok: true, cells: parsed.cells };
  } catch (error) {
    return { provider: provider.id, ok: false, error: error.message };
  }
}

console.log(`Checking ${current.providers.length} providers in parallel with ${model}.`);
const providerResults = await Promise.all(current.providers.map(researchProvider));

const merged = mergeResearch(current, providerResults, timestamp);
await writeFile(dataPath, `${JSON.stringify(merged.data, null, 2)}\n`);

if (merged.pending) {
  await writeFile(pendingPath, `${JSON.stringify(merged.pending, null, 2)}\n`);
  console.log(`${merged.pending.proposals.length} price change(s) held for review as ${merged.pending.id}.`);
} else {
  await unlink(pendingPath).catch(error => {
    if (error.code !== "ENOENT") throw error;
  });
}

if (merged.complete) {
  console.log("Complete pull passed. Last successful update advanced.");
} else {
  console.warn(`::warning::Partial comparison refresh: ${merged.acceptedCells} of ${current.cells.length} cells passed. Successful cells and staleness state will be committed; the last successful update remains unchanged.`);
  for (const item of merged.errors) console.warn(`- ${item.provider}: ${item.errors.join(" ")}`);
  if (merged.totalFailure) {
    console.error("::error::Total research failure: no provider cells passed validation.");
    process.exitCode = 1;
  }
}
