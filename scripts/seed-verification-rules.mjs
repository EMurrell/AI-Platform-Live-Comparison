export const REQUIRED_CONFIRMATION = "I reviewed the source-backed baseline";

export function verifySeed(data, { actor, timestamp, confirmation }) {
  if (confirmation !== REQUIRED_CONFIRMATION) {
    throw new Error(`Confirmation must exactly match: ${REQUIRED_CONFIRMATION}`);
  }
  if (!actor) throw new Error("A GitHub actor is required for the verification record.");
  if (Number.isNaN(new Date(timestamp).getTime())) {
    throw new Error("A valid verification timestamp is required.");
  }
  if (data.seed_verified) {
    throw new Error("The source-backed baseline has already been approved.");
  }

  const untouchedSeeds = data.cells.filter(cell => cell.change_kind === "unverified_seed");
  if (untouchedSeeds.length) {
    throw new Error(`${untouchedSeeds.length} machine-generated seed cells still require source-backed research.`);
  }

  const next = structuredClone(data);
  next.seed_verified = true;
  next.seed_verification = {
    actor,
    verified_at: timestamp
  };
  next.method = next.last_successful_update
    ? `The source-backed baseline was reviewed and approved by ${actor}. Official vendor sources were subsequently checked by the automated research workflow.`
    : `The source-backed baseline was reviewed and approved by ${actor}. The first complete automated source refresh is still pending.`;
  next.changelog = [
    {
      date: timestamp.slice(0, 10),
      summary: `Initial source-backed baseline reviewed and approved by ${actor}.`
    },
    ...next.changelog
  ].slice(0, 20);
  return next;
}
