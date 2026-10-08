import type { WaitsFor } from "@repo/contract";
import type { Db, Trx } from "./app.ts";

type Query = Db | Trx;

export async function monsterAheadOrder(db: Query) {
  return db
    .selectFrom("monster_run")
    .innerJoin("process", "process.id", "monster_run.process_id")
    .innerJoin("interview", "interview.id", "process.interview_id")
    .select([
      "monster_run.id",
      "monster_run.process_id",
      "monster_run.kind",
      "monster_run.status",
      "monster_run.created_at",
      "process.name as process_name",
      "process.position",
      "interview.created_at as interview_created_at",
    ])
    .where("monster_run.status", "in", ["queued", "running"])
    .execute();
}

function rank(row: { kind: string; created_at: Date | string; interview_created_at: Date | string; position: number }) {
  const created = new Date(row.created_at).getTime();
  const interview = new Date(row.interview_created_at).getTime();
  return [
    row.kind === "repair" ? 0 : 1,
    row.kind === "repair" ? created : interview,
    row.kind === "learn" ? row.position : 0,
    created,
  ] as const;
}

function before(
  a: { kind: string; created_at: Date | string; interview_created_at: Date | string; position: number },
  b: { kind: string; created_at: Date | string; interview_created_at: Date | string; position: number },
) {
  const left = rank(a);
  const right = rank(b);
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return (left[i] ?? 0) < (right[i] ?? 0);
  }
  return false;
}

export async function processSites(db: Query, processId: string): Promise<string[]> {
  const rows: Array<{ site: string }> = await db
    .selectFrom("process_site")
    .select("site")
    .where("process_id", "=", processId)
    .execute();
  return rows.map((row) => row.site);
}

export function shareSite(a: readonly string[], b: readonly string[]): string | null {
  for (const site of a) if (b.includes(site)) return site;
  return null;
}

export async function waitsFor(db: Query, processId: string, maxMonsters: number): Promise<WaitsFor> {
  const live = await monsterAheadOrder(db);
  const mine = live.find((row: (typeof live)[number]) => row.process_id === processId && row.status === "queued");
  if (!mine) return { processId: null, processName: null, site: null };
  const sites = await processSites(db, processId);
  const running = live.filter((row: (typeof live)[number]) => row.status === "running");
  if (running.length >= maxMonsters) {
    return { processId: null, processName: null, site: null };
  }
  for (const other of live) {
    if (other.id === mine.id) continue;
    const otherSites = await processSites(db, other.process_id);
    const shared = shareSite(sites, otherSites);
    if (!shared) continue;
    if (other.status === "running" || before(other, mine)) {
      return { processId: other.process_id, processName: other.process_name, site: shared };
    }
  }
  return { processId: null, processName: null, site: null };
}

export async function canClaimMonster(
  db: Query,
  monsterRunId: string,
  maxMonsters: number,
): Promise<boolean> {
  const live = await monsterAheadOrder(db);
  const mine = live.find((row: (typeof live)[number]) => row.id === monsterRunId && row.status === "queued");
  if (!mine) return false;
  const running = live.filter((row: (typeof live)[number]) => row.status === "running");
  if (running.length >= maxMonsters) return false;
  const sites = await processSites(db, mine.process_id);
  for (const other of live) {
    if (other.id === mine.id) continue;
    const otherSites = await processSites(db, other.process_id);
    if (!shareSite(sites, otherSites)) continue;
    if (other.status === "running") return false;
    if (other.status === "queued" && before(other, mine)) return false;
  }
  return true;
}

export async function canClaimRun(db: Query, runId: string, maxRuns: number): Promise<boolean> {
  const run = await db.selectFrom("run").selectAll().where("id", "=", runId).executeTakeFirst();
  if (!run || run.status !== "pending") return false;
  const running = await db.selectFrom("run").selectAll().where("status", "=", "running").execute();
  if (running.length >= maxRuns) return false;
  if (running.some((row: (typeof running)[number]) => row.process_id === run.process_id)) return false;
  return true;
}
