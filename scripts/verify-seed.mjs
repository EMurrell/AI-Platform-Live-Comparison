import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { verifySeed } from "./seed-verification-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "data/current.json");
const data = JSON.parse(await readFile(dataPath, "utf8"));
const actor = process.env.GITHUB_ACTOR;
const confirmation = process.env.SEED_VERIFICATION_CONFIRMATION;
const timestamp = new Date().toISOString();
const verified = verifySeed(data, { actor, timestamp, confirmation });

await writeFile(dataPath, `${JSON.stringify(verified, null, 2)}\n`);
console.log(`Recorded source-backed baseline approval by ${actor}.`);
