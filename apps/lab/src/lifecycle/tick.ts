import type { Trx } from "../app.ts";

export async function queueTick(trx: Trx, processId: string, kind: "scheduled" | "run_now") {
  return trx
    .insertInto("tick")
    .values({ process_id: processId, kind, status: "queued" })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function claimTick(trx: Trx, id: string): Promise<boolean> {
  const result = await trx
    .updateTable("tick")
    .set({ status: "running", started_at: new Date() })
    .where("id", "=", id)
    .where("status", "=", "queued")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function finishTick(trx: Trx, id: string, newItems: number): Promise<boolean> {
  const result = await trx
    .updateTable("tick")
    .set({ status: "finished", new_items: newItems, finished_at: new Date() })
    .where("id", "=", id)
    .where("status", "in", ["queued", "running"])
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export async function requeueTick(trx: Trx, id: string): Promise<boolean> {
  const result = await trx
    .updateTable("tick")
    .set({ status: "queued", started_at: null })
    .where("id", "=", id)
    .where("status", "=", "running")
    .executeTakeFirst();
  return Number(result.numUpdatedRows) > 0;
}

export function tickFinishedEvent(processId: string, tickId: string, newItems: number) {
  return { kind: "tick.finished" as const, processId, tickId, newItems };
}
