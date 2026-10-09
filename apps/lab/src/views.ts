import type {
  Fact,
  HumanCause,
  Interview,
  Invitation,
  LastRun,
  MonsterRun,
  ProcessDetail,
  ProcessSummary,
  Refusal,
  Repair,
  Run,
  Schedule,
  SiteKind,
  SiteRef,
  Tick,
  TokenUsage,
  Tool,
  ToolKind,
  ToolOrigin,
  ToolSummary,
  TranscriptTurn,
  WaitsFor,
} from "@repo/contract";
import type { Lab, Trx } from "./app.ts";
import { serveCodePath } from "./store/shelf-index.ts";
import { loginHeld, readLogins } from "./store/logins.ts";
import { asNumber, iso } from "./time.ts";

export function scheduleOf(row: {
  schedule_kind: string;
  schedule_time: string | null;
  schedule_minutes: number | null;
}): Schedule {
  if (row.schedule_kind === "daily") return { kind: "daily", time: row.schedule_time ?? "00:00" };
  return { kind: "every", minutes: row.schedule_minutes ?? 1 };
}

export function siteRef(row: { site: string; kind: string; login_needed: boolean }): SiteRef {
  return {
    site: row.site,
    kind: row.kind as SiteKind,
    readOnly: row.kind === "connector",
    loginNeeded: row.login_needed,
  };
}

export function tokensOf(rows: Array<{ tokens_input: string | number | bigint; tokens_output: string | number | bigint; tokens_cached: string | number | bigint }>): TokenUsage {
  const input = rows.reduce((sum, row) => sum + asNumber(row.tokens_input), 0);
  const output = rows.reduce((sum, row) => sum + asNumber(row.tokens_output), 0);
  const cached = rows.reduce((sum, row) => sum + asNumber(row.tokens_cached), 0);
  return { input, output, cached, total: input + output + cached };
}

function asFacts(value: unknown): Fact[] {
  return Array.isArray(value) ? (value as Fact[]) : [];
}

export async function invitationView(lab: Lab, trx: Trx): Promise<Invitation> {
  const sites = await trx
    .selectFrom("invitation_site")
    .selectAll()
    .orderBy("granted_at")
    .orderBy("site")
    .execute();
  const needed = await trx
    .selectFrom("process_site")
    .innerJoin("process", "process.id", "process_site.process_id")
    .select([
      "process_site.site",
      "process.id as process_id",
      "process.name as process_name",
      "process.status as process_status",
    ])
    .execute();
  const logins = await readLogins(lab.config);
  return {
    sites: sites.map((site) => ({
      ...siteRef(site),
      loginHeld: loginHeld(logins, site.site),
      grantedAt: iso(site.granted_at),
      neededBy: needed
        .filter((row) => row.site === site.site)
        .map((row) => ({
          id: row.process_id,
          name: row.process_name,
          status: row.process_status as ProcessSummary["status"],
        })),
    })),
  };
}

export async function processSummary(lab: Lab, trx: Trx, id: string): Promise<ProcessSummary | null> {
  const row = await trx.selectFrom("process").selectAll().where("id", "=", id).executeTakeFirst();
  if (!row) return null;
  const sites = await trx.selectFrom("process_site").selectAll().where("process_id", "=", id).execute();
  const logins = await readLogins(lab.config);
  const last = await trx
    .selectFrom("run")
    .selectAll()
    .where("process_id", "=", id)
    .where("started_at", "is not", null)
    .orderBy("started_at", "desc")
    .limit(1)
    .executeTakeFirst();
  const latestAction = row.current_monster_run_id
    ? await trx
        .selectFrom("monster_action")
        .selectAll()
        .where("monster_run_id", "=", row.current_monster_run_id)
        .orderBy("seq", "desc")
        .limit(1)
        .executeTakeFirst()
    : undefined;
  const tokenRows = await trx
    .selectFrom("monster_run")
    .select(["tokens_input", "tokens_output", "tokens_cached"])
    .where("process_id", "=", id)
    .execute();
  const lastRun: LastRun | null = last?.started_at
    ? {
        id: last.id,
        status: last.status as LastRun["status"],
        startedAt: iso(last.started_at),
        durationMs: last.duration_ms ?? 0,
        modelCalls: last.model_calls,
      }
    : null;
  return {
    id: row.id,
    interviewId: row.interview_id,
    position: row.position,
    name: row.name,
    description: row.description,
    successCriterion: row.success_criterion,
    status: row.status as ProcessSummary["status"],
    repaired: row.repaired,
    sites: sites.map((site) => ({ ...siteRef(site), loginHeld: loginHeld(logins, site.site) })),
    schedule: scheduleOf(row),
    nextRunAt: row.next_run_at ? iso(row.next_run_at) : null,
    lastRun,
    currentMonsterRunId: row.current_monster_run_id,
    latestAction: latestAction
      ? {
          id: latestAction.id,
          at: iso(latestAction.at),
          kind: latestAction.kind as NonNullable<ProcessSummary["latestAction"]>["kind"],
          text: latestAction.text,
          tool: latestAction.tool_name,
        }
      : null,
    tokens: tokensOf(tokenRows),
    reason: row.status === "failed_to_learn" || row.status === "needs_human" ? row.reason : null,
    createdAt: iso(row.created_at),
    sealedAt: row.sealed_at ? iso(row.sealed_at) : null,
    retiredAt: row.retired_at ? iso(row.retired_at) : null,
  };
}

export async function interviewView(lab: Lab, trx: Trx, id: string): Promise<Interview | null> {
  const row = await trx.selectFrom("interview").selectAll().where("id", "=", id).executeTakeFirst();
  if (!row) return null;
  const processes = await trx
    .selectFrom("process")
    .select("id")
    .where("interview_id", "=", id)
    .orderBy("position")
    .execute();
  const summaries = [];
  for (const process of processes) {
    const summary = await processSummary(lab, trx, process.id);
    if (summary) summaries.push(summary);
  }
  return {
    id: row.id,
    status: row.status as Interview["status"],
    readError: row.read_error,
    language: row.language,
    startedAt: iso(row.started_at),
    endedAt: iso(row.ended_at),
    transcript: row.transcript as unknown as TranscriptTurn[],
    invitedAt: row.invited_at ? iso(row.invited_at) : null,
    processes: summaries,
  };
}

export async function runView(lab: Lab, trx: Trx, id: string): Promise<Run | null> {
  const row = await trx.selectFrom("run").selectAll().where("id", "=", id).executeTakeFirst();
  if (!row) return null;
  const steps = await trx
    .selectFrom("run_step")
    .innerJoin("tool", "tool.id", "run_step.tool_id")
    .innerJoin("tool_version", "tool_version.id", "run_step.tool_version_id")
    .select([
      "run_step.position",
      "run_step.status",
      "run_step.result",
      "run_step.error",
      "tool.name as tool_name",
      "tool.kind as tool_kind",
      "tool_version.version",
    ])
    .where("run_step.run_id", "=", id)
    .orderBy("run_step.position")
    .execute();
  const refusals = await refusalViews(trx, { runId: id });
  return {
    id: row.id,
    processId: row.process_id,
    tickId: row.tick_id,
    kind: row.kind as Run["kind"],
    itemId: row.item_id,
    itemLabel: row.item_label,
    itemFields: asFacts(row.item_fields),
    status: row.status as Run["status"],
    startedAt: iso(row.started_at ?? row.created_at),
    durationMs: row.duration_ms ?? 0,
    modelCalls: row.model_calls,
    proofValue: row.proof_value,
    steps: steps.map((step) => ({
      position: step.position,
      tool: step.tool_name,
      version: step.version,
      kind: step.tool_kind as ToolKind,
      status: step.status as Run["steps"][number]["status"],
      result: asFacts(step.result),
      error: step.error,
    })),
    failedStep: row.failed_step,
    error: row.error,
    refusals,
    repairId: row.repair_id,
  };
}

async function refusalViews(
  trx: Trx,
  filter: { runId?: string; monsterRunId?: string },
): Promise<Refusal[]> {
  let query = trx
    .selectFrom("refusal")
    .innerJoin("process", "process.id", "refusal.process_id")
    .selectAll("refusal")
    .select(["process.name as process_name"]);
  if (filter.runId) query = query.where("refusal.run_id", "=", filter.runId);
  if (filter.monsterRunId) query = query.where("refusal.monster_run_id", "=", filter.monsterRunId);
  const rows = await query.orderBy("refusal.at").execute();
  return rows.map((row) => ({
    id: row.id,
    site: row.site,
    stage: row.stage as Refusal["stage"],
    at: iso(row.at),
    tool: row.tool_name,
    version: row.tool_version,
    processId: row.process_id,
    processName: row.process_name,
    runId: row.run_id,
    monsterRunId: row.monster_run_id,
  }));
}

export async function processDetail(
  lab: Lab,
  trx: Trx,
  id: string,
  waitsFor: WaitsFor | null,
): Promise<ProcessDetail | null> {
  const summary = await processSummary(lab, trx, id);
  if (!summary) return null;
  const row = await trx.selectFrom("process").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
  const steps = await trx
    .selectFrom("process_step")
    .innerJoin("tool", "tool.id", "process_step.tool_id")
    .leftJoin("tool_version", "tool_version.id", "tool.current_version_id")
    .select([
      "process_step.position",
      "process_step.origin",
      "tool.name as tool_name",
      "tool.kind as tool_kind",
      "tool.description as tool_description",
      "tool_version.version as version",
    ])
    .where("process_step.process_id", "=", id)
    .orderBy("process_step.position")
    .execute();
  const lastTick = await trx
    .selectFrom("tick")
    .selectAll()
    .where("process_id", "=", id)
    .where("status", "=", "finished")
    .orderBy("finished_at", "desc")
    .limit(1)
    .executeTakeFirst();
  const latestRepair = row.latest_repair_id
    ? await trx
        .selectFrom("repair")
        .innerJoin("tool", "tool.id", "repair.tool_id")
        .innerJoin("tool_version as from_v", "from_v.id", "repair.from_version_id")
        .leftJoin("tool_version as to_v", "to_v.id", "repair.to_version_id")
        .select([
          "repair.id",
          "repair.created_at",
          "tool.name as tool_name",
          "from_v.version as from_version",
          "to_v.version as to_version",
        ])
        .where("repair.id", "=", row.latest_repair_id)
        .executeTakeFirst()
    : undefined;
  const runRows = await trx
    .selectFrom("run")
    .select("id")
    .where("process_id", "=", id)
    .orderBy("created_at", "desc")
    .limit(200)
    .execute();
  const runs = [];
  for (const item of runRows) {
    const view = await runView(lab, trx, item.id);
    if (view) runs.push(view);
  }
  let cause: HumanCause | null = null;
  if (row.status === "needs_human" && row.cause_run_id) {
    cause = row.cause_refusal_id
      ? { kind: "refusal", refusalId: row.cause_refusal_id, runId: row.cause_run_id }
      : { kind: "run", runId: row.cause_run_id };
  }
  const tickView: Tick | null = lastTick
    ? {
        id: lastTick.id,
        processId: lastTick.process_id,
        at: iso(lastTick.finished_at ?? lastTick.created_at),
        kind: lastTick.kind as Tick["kind"],
        newItems: lastTick.new_items ?? 0,
      }
    : null;
  return {
    ...summary,
    chain: steps.map((step) => ({
      position: step.position,
      tool: step.tool_name,
      version: step.version ?? 0,
      kind: step.tool_kind as ToolKind,
      origin: step.origin as ToolOrigin,
      description: step.tool_description,
    })),
    check:
      row.check_name && row.check_description
        ? { name: row.check_name, description: row.check_description }
        : null,
    verificationRunId: row.verification_run_id,
    cause,
    latestRepair: latestRepair
      ? {
          id: latestRepair.id,
          tool: latestRepair.tool_name,
          fromVersion: latestRepair.from_version,
          toVersion: latestRepair.to_version ?? latestRepair.from_version,
          at: iso(latestRepair.created_at),
        }
      : null,
    lastTick: tickView,
    waitsFor: row.status === "queued" ? waitsFor : null,
    runs,
  };
}

export async function toolSummary(lab: Lab, trx: Trx, name: string): Promise<ToolSummary | null> {
  const tool = await trx.selectFrom("tool").selectAll().where("name", "=", name).executeTakeFirst();
  if (!tool) return null;
  const version = tool.current_version_id
    ? await trx.selectFrom("tool_version").selectAll().where("id", "=", tool.current_version_id).executeTakeFirst()
    : undefined;
  const sites = await trx.selectFrom("tool_site").select("site").where("tool_id", "=", tool.id).execute();
  const maker = await trx
    .selectFrom("process")
    .select(["id", "name"])
    .where("id", "=", tool.created_for_process_id)
    .executeTakeFirstOrThrow();
  const usedBy = await trx
    .selectFrom("process_step")
    .innerJoin("process", "process.id", "process_step.process_id")
    .select(["process.id", "process.name", "process_step.origin"])
    .where("process_step.tool_id", "=", tool.id)
    .execute();
  const repairCount = await trx
    .selectFrom("repair")
    .select((eb) => eb.fn.countAll().as("count"))
    .where("tool_id", "=", tool.id)
    .executeTakeFirst();
  return {
    name: tool.name,
    description: tool.description,
    sites: sites.map((row) => row.site),
    kind: tool.kind as ToolKind,
    createdBy: {
      processId: maker.id,
      processName: maker.name,
      monsterRunId: tool.created_by_monster_run_id,
      at: iso(tool.created_at),
    },
    usedBy: usedBy.map((row) => ({
      processId: row.id,
      processName: row.name,
      origin: row.origin as ToolOrigin,
    })),
    currentVersion: version?.version ?? 0,
    repairCount: Number(repairCount?.count ?? 0),
    codePath: version
      ? serveCodePath(lab.config.shelfDir, lab.config.repoRoot, version.code_path)
      : "",
  };
}

export async function toolView(lab: Lab, trx: Trx, name: string): Promise<Tool | null> {
  const summary = await toolSummary(lab, trx, name);
  if (!summary) return null;
  const tool = await trx.selectFrom("tool").selectAll().where("name", "=", name).executeTakeFirstOrThrow();
  const versions = await trx
    .selectFrom("tool_version")
    .selectAll()
    .where("tool_id", "=", tool.id)
    .where("became_current_at", "is not", null)
    .orderBy("version", "desc")
    .execute();
  const repairs = await listRepairs(trx, { toolId: tool.id });
  return {
    ...summary,
    versions: versions.map((version) => ({
      version: version.version,
      current: version.id === tool.current_version_id,
      becameCurrentAt: iso(version.became_current_at ?? version.created_at),
      origin:
        version.origin_kind === "learn"
          ? {
              kind: "learn" as const,
              processId: tool.created_for_process_id,
              processName: summary.createdBy.processName,
              monsterRunId: version.monster_run_id,
            }
          : {
              kind: "repair" as const,
              repairId: repairs.find((item) => item.monsterRunId === version.monster_run_id)?.id ?? "",
              monsterRunId: version.monster_run_id,
            },
      codePath: serveCodePath(lab.config.shelfDir, lab.config.repoRoot, version.code_path),
      examples: asFacts(version.examples) as unknown as Tool["versions"][number]["examples"],
    })),
    repairs,
  };
}

async function listRepairs(
  trx: Trx,
  filter: { toolId?: string },
): Promise<Repair[]> {
  let query = trx
    .selectFrom("repair")
    .innerJoin("tool", "tool.id", "repair.tool_id")
    .innerJoin("monster_run", "monster_run.id", "repair.monster_run_id")
    .innerJoin("tool_version as from_v", "from_v.id", "repair.from_version_id")
    .leftJoin("tool_version as to_v", "to_v.id", "repair.to_version_id")
    .selectAll("repair")
    .select([
      "tool.name as tool_name",
      "from_v.version as from_version",
      "to_v.version as to_version",
      "monster_run.tokens_input",
      "monster_run.tokens_output",
      "monster_run.tokens_cached",
    ]);
  if (filter.toolId) query = query.where("repair.tool_id", "=", filter.toolId);
  const rows = await query.orderBy("repair.created_at", "desc").execute();
  return rows.map((row) => ({
    id: row.id,
    tool: row.tool_name,
    processId: row.process_id,
    monsterRunId: row.monster_run_id,
    fromVersion: row.from_version,
    toVersion: row.to_version,
    failedRunId: row.failed_run_id,
    retryRunId: row.retry_run_id,
    itemLabel: row.item_label,
    whatFailed: row.what_failed,
    whatChanged: row.what_changed,
    result: row.result as Repair["result"],
    reason: row.reason,
    tokens: tokensOf([row]),
    at: iso(row.created_at),
  }));
}

export async function monsterRunView(lab: Lab, trx: Trx, id: string): Promise<MonsterRun | null> {
  const row = await trx.selectFrom("monster_run").selectAll().where("id", "=", id).executeTakeFirst();
  if (!row) return null;
  const actions = await trx
    .selectFrom("monster_action")
    .selectAll()
    .where("monster_run_id", "=", id)
    .orderBy("seq")
    .execute();
  const lines = await trx
    .selectFrom("verification_line")
    .selectAll()
    .where("monster_run_id", "=", id)
    .orderBy("seq")
    .execute();
  const tools = await trx
    .selectFrom("monster_run_tool")
    .innerJoin("tool", "tool.id", "monster_run_tool.tool_id")
    .innerJoin("process", "process.id", "tool.created_for_process_id")
    .select(["tool.name", "monster_run_tool.origin", "process.id as made_for_id", "process.name as made_for_name"])
    .where("monster_run_id", "=", id)
    .execute();
  const refusals = await refusalViews(trx, { monsterRunId: id });
  const repair = await trx.selectFrom("repair").select("id").where("monster_run_id", "=", id).executeTakeFirst();
  return {
    id: row.id,
    processId: row.process_id,
    kind: row.kind as MonsterRun["kind"],
    status: row.status as MonsterRun["status"],
    startedAt: row.started_at ? iso(row.started_at) : null,
    endedAt: row.ended_at ? iso(row.ended_at) : null,
    model: row.model,
    tokens: tokensOf([row]),
    toolsCreated: tools.filter((item) => item.origin === "made").map((item) => item.name),
    toolsReused: tools
      .filter((item) => item.origin === "reused")
      .map((item) => ({
        tool: item.name,
        madeForProcessId: item.made_for_id,
        madeForProcessName: item.made_for_name,
      })),
    reason: row.reason,
    actions: actions.map((action) => ({
      id: action.id,
      at: iso(action.at),
      kind: action.kind as MonsterRun["actions"][number]["kind"],
      text: action.text,
      tool: action.tool_name,
    })),
    verification: lines.map((line) => ({
      id: line.id,
      at: iso(line.at),
      text: line.text,
      outcome: line.outcome as MonsterRun["verification"][number]["outcome"],
    })),
    failedRunId: row.failed_run_id,
    repairId: repair?.id ?? null,
    refusals,
  };
}

export { asFacts };
