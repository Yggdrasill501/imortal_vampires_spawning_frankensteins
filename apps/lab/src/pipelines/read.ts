import { SCHEDULE_MINUTES_MAX, SCHEDULE_MINUTES_MIN } from "@repo/contract";
import type { Lab } from "../app.ts";
import * as interviewLife from "../lifecycle/interview.ts";
import { isSiteIdentity, siteIdentity } from "../site.ts";
import { ensureStop } from "../errors.ts";
import type { ProcessProposal } from "../seams/types.ts";

export async function readPipeline(lab: Lab, interviewId: string, signal: AbortSignal): Promise<void> {
  const interview = await lab.db
    .selectFrom("interview")
    .selectAll()
    .where("id", "=", interviewId)
    .executeTakeFirst();
  if (!interview) return;
  lab.log.info({ seam: "orchestrator", record: interviewId }, "seam start");
  const started = Date.now();
  let result;
  try {
    result = await lab.seams.orchestrator.propose({
      interviewId,
      transcript: interview.transcript as never,
      language: interview.language,
      model: lab.config.model,
      signal,
    });
  } catch {
    result = { error: "The lab failed while doing this." };
  }
  lab.log.info(
    { seam: "orchestrator", record: interviewId, duration: Date.now() - started, outcome: "error" in result ? "failed" : "ok" },
    "seam end",
  );

  if ("error" in result) {
    await lab.db.transaction().execute(async (trx) => {
      await interviewLife.markReadFailed(trx, interviewId, ensureStop(result.error));
    });
    return;
  }

  const invalid = result.proposals.some((proposal) => !validProposal(proposal));
  await lab.db.transaction().execute(async (trx) => {
    if (invalid) {
      await interviewLife.markReadFailed(
        trx,
        interviewId,
        "The reading came back in a form the lab could not use.",
      );
      return;
    }
    if (result.proposals.length === 0) {
      await interviewLife.markNothingFound(trx, interviewId);
      lab.events.emit(interviewLife.interviewStatusEvent(interviewId, "nothing_found"));
      return;
    }
    await interviewLife.storeProposals(trx, interviewId, result.proposals);
    lab.events.emit(interviewLife.interviewStatusEvent(interviewId, "proposed"));
  });
}

function validProposal(proposal: ProcessProposal): boolean {
  if (!proposal.name?.trim() || !proposal.description?.trim() || !proposal.successCriterion?.trim()) {
    return false;
  }
  if (!Array.isArray(proposal.sites) || proposal.sites.length === 0) return false;
  for (const site of proposal.sites) {
    if (site.kind !== "website" && site.kind !== "connector") return false;
    const identity = siteIdentity(site.site, site.kind);
    if (!identity || !isSiteIdentity(identity, site.kind)) return false;
  }
  if (proposal.schedule.kind === "daily") {
    return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(proposal.schedule.time);
  }
  if (proposal.schedule.kind === "every") {
    return (
      Number.isInteger(proposal.schedule.minutes) &&
      proposal.schedule.minutes >= SCHEDULE_MINUTES_MIN &&
      proposal.schedule.minutes <= SCHEDULE_MINUTES_MAX
    );
  }
  return false;
}
