import type { InterviewStatus } from "@repo/contract";
import { jsonb } from "@repo/db";
import type { Trx } from "../app.ts";
import type { ProcessProposal } from "../seams/types.ts";
import { siteIdentity } from "../site.ts";

export async function createInterview(
  trx: Trx,
  input: {
    language: string;
    transcript: unknown;
    startedAt: Date;
    endedAt: Date;
    continuedFromId: string | null;
  },
) {
  return trx
    .insertInto("interview")
    .values({
      language: input.language,
      transcript: jsonb(input.transcript),
      started_at: input.startedAt,
      ended_at: input.endedAt,
      continued_from_id: input.continuedFromId,
      status: "being_read",
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function markReadStarted(trx: Trx, id: string): Promise<boolean> {
  const result = await trx
    .updateTable("interview")
    .set({ read_started_at: new Date() })
    .where("id", "=", id)
    .where("status", "=", "being_read")
    .where("read_started_at", "is", null)
    .where("read_error", "is", null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function clearReadStart(trx: Trx, id: string): Promise<void> {
  await trx
    .updateTable("interview")
    .set({ read_started_at: null })
    .where("id", "=", id)
    .where("status", "=", "being_read")
    .execute();
}

export async function markReadFailed(trx: Trx, id: string, error: string): Promise<boolean> {
  const result = await trx
    .updateTable("interview")
    .set({ read_error: error })
    .where("id", "=", id)
    .where("status", "=", "being_read")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function markNothingFound(trx: Trx, id: string): Promise<boolean> {
  const result = await trx
    .updateTable("interview")
    .set({ status: "nothing_found" })
    .where("id", "=", id)
    .where("status", "=", "being_read")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function storeProposals(
  trx: Trx,
  interviewId: string,
  proposals: ProcessProposal[],
): Promise<boolean> {
  for (const [index, proposal] of proposals.entries()) {
    const process = await trx
      .insertInto("process")
      .values({
        interview_id: interviewId,
        position: index + 1,
        name: proposal.name,
        description: proposal.description,
        success_criterion: proposal.successCriterion,
        status: "proposed",
        schedule_kind: proposal.schedule.kind,
        schedule_time: proposal.schedule.kind === "daily" ? proposal.schedule.time : null,
        schedule_minutes: proposal.schedule.kind === "every" ? proposal.schedule.minutes : null,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    for (const site of proposal.sites) {
      await trx
        .insertInto("process_site")
        .values({
          process_id: process.id,
          site: siteIdentity(site.site, site.kind),
          kind: site.kind,
          login_needed: site.loginNeeded,
        })
        .execute();
    }
  }
  const result = await trx
    .updateTable("interview")
    .set({ status: "proposed" })
    .where("id", "=", interviewId)
    .where("status", "=", "being_read")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function markInvited(trx: Trx, id: string): Promise<boolean> {
  const result = await trx
    .updateTable("interview")
    .set({ invited_at: new Date() })
    .where("id", "=", id)
    .where("status", "=", "proposed")
    .where("invited_at", "is", null)
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export function interviewStatusEvent(id: string, status: InterviewStatus) {
  return { kind: "interview.status" as const, interviewId: id, status };
}
