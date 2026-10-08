import type { ActionKind } from "@repo/contract";
import type { Lab, Trx } from "../app.ts";
import { iso } from "../time.ts";
import { readLogins, redactSecrets } from "./logins.ts";

export async function recordAction(
  lab: Lab,
  trx: Trx,
  input: { monsterRunId: string; kind: ActionKind; text: string; toolName?: string | null },
) {
  const logins = await readLogins(lab.config);
  const row = await trx
    .insertInto("monster_action")
    .values({
      monster_run_id: input.monsterRunId,
      kind: input.kind,
      text: redactSecrets(input.text, logins),
      tool_name: input.toolName ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return row;
}

export async function setTokens(
  trx: Trx,
  monsterRunId: string,
  tokens: { input: number; output: number; cached: number },
) {
  await trx
    .updateTable("monster_run")
    .set({
      tokens_input: tokens.input,
      tokens_output: tokens.output,
      tokens_cached: tokens.cached,
    })
    .where("id", "=", monsterRunId)
    .execute();
}

export async function addVerificationLine(trx: Trx, monsterRunId: string, text: string) {
  return trx
    .insertInto("verification_line")
    .values({ monster_run_id: monsterRunId, text, outcome: "pending" })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function setVerificationOutcome(
  trx: Trx,
  id: string,
  outcome: "passed" | "failed",
) {
  return trx
    .updateTable("verification_line")
    .set({ outcome })
    .where("id", "=", id)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export function actionView(row: {
  id: string;
  at: Date | string;
  kind: string;
  text: string;
  tool_name: string | null;
}) {
  return {
    id: row.id,
    at: iso(row.at),
    kind: row.kind as ActionKind,
    text: row.text,
    tool: row.tool_name,
  };
}
