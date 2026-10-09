/**
 * The simulated lab: a small state machine that keeps made-up records in the
 * browser tab and moves them forward over time, the way the lab service will.
 * It is plain data plus a job queue, so it survives a reload.
 */
import type {
  Action,
  ActionKind,
  Fact,
  Id,
  Interview,
  Invitation,
  InvitationSite,
  LabEvent,
  MonsterRun,
  ProcessDetail,
  ProcessSummary,
  PutInvitationRequest,
  Refusal,
  Repair,
  Run,
  RunKind,
  RunStep,
  SaveInterviewRequest,
  Schedule,
  Tick,
  TokenUsage,
  Tool,
  ToolSummary,
} from "@repo/contract";
import { SCHEDULE_MINUTES_MAX, SCHEDULE_MINUTES_MIN } from "@repo/contract";
import { LabError, type MockScenario } from "../client";
import {
  BLUEPRINTS,
  INTERVIEW_SETS,
  PEOPLE,
  REFERENCE_TRANSCRIPT,
  SITES,
  TOOLS,
  type Outcome,
  type Person,
} from "./blueprints";

type InterviewRow = Omit<Interview, "processes">;
type SiteRow = Omit<InvitationSite, "neededBy">;

interface ProcRow extends Omit<
  ProcessDetail,
  "runs" | "lastRun" | "latestAction" | "tokens" | "lastTick"
> {
  key: string;
  /** How many items the runner has taken from the inbox. */
  inbox: number;
  attempts: number;
}

type Step =
  | { t: "action"; kind: ActionKind; text: string; tool?: string }
  | { t: "create"; tool: string }
  | { t: "reuse"; tool: string }
  | { t: "verify"; text: string }
  | { t: "learned" }
  | { t: "learn_failed" }
  | { t: "repaired" }
  | { t: "unfixed" };

type Job =
  | { at: number; type: "propose"; interviewId: Id }
  | { at: number; type: "step"; monsterRunId: Id; n: number }
  | { at: number; type: "tick"; processId: Id; kind: "scheduled" | "run_now" }
  | { at: number; type: "run_end"; runId: Id };

interface Pending {
  person: Person;
  outcome: Outcome;
  extra: Fact[];
}

interface Db {
  version: 3;
  scenario: MockScenario;
  seq: number;
  set: number;
  interviews: InterviewRow[];
  processes: ProcRow[];
  sites: SiteRow[];
  tools: Tool[];
  runs: Run[];
  monsterRuns: MonsterRun[];
  ticks: Tick[];
  jobs: Job[];
  scripts: Record<Id, Step[]>;
  pending: Record<Id, Pending>;
}

type EventInput = LabEvent extends infer E
  ? E extends LabEvent
    ? Omit<E, "id" | "at">
    : never
  : never;

const STORE_KEY = "lab-mock-db";
const ZERO: TokenUsage = { input: 0, output: 0, cached: 0, total: 0 };
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII"];

function emptyDb(scenario: MockScenario): Db {
  return {
    version: 3,
    scenario,
    seq: 0,
    set: 0,
    interviews: [],
    processes: [],
    sites: [],
    tools: [],
    runs: [],
    monsterRuns: [],
    ticks: [],
    jobs: [],
    scripts: {},
    pending: {},
  };
}

export class Engine {
  db: Db;
  /** Set while seeding: the engine then lives in the past and emits nothing. */
  private virtualNow: number | null = null;
  private scale = 1;
  private listeners = new Set<(event: LabEvent) => void>();

  constructor(scenario: MockScenario, stored: string | null) {
    let db: Db | null = null;
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Db;
        if (parsed.version === 3 && parsed.scenario === scenario) db = parsed;
      } catch {
        db = null;
      }
    }
    this.db = db ?? emptyDb(scenario);
    if (!db) this.seed(scenario);
  }

  // ───────────── plumbing ─────────────

  now(): number {
    return this.virtualNow ?? Date.now();
  }
  private iso(): string {
    return new Date(this.now()).toISOString();
  }
  private id(prefix: string): Id {
    this.db.seq += 1;
    return `${prefix}-${this.db.seq}`;
  }
  /** A repeatable number in [0, 1) so the same story plays the same way. */
  private chance(salt: number): number {
    const x =
      Math.sin((this.db.seq + 1) * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }
  private emit(event: EventInput) {
    if (this.virtualNow !== null) return;
    const full = { ...event, id: this.id("ev"), at: this.iso() } as LabEvent;
    for (const listener of [...this.listeners]) listener(full);
  }
  listen(listener: (event: LabEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private after(
    ms: number,
    job: Job extends infer J ? (J extends Job ? Omit<J, "at"> : never) : never,
  ) {
    this.db.jobs.push({ ...job, at: this.now() + ms * this.scale } as Job);
  }
  save() {
    try {
      window.sessionStorage.setItem(STORE_KEY, JSON.stringify(this.db));
    } catch {
      // Storage may be full or closed; the simulation still runs for this page.
    }
  }

  /** Runs every job that is due. Returns whether anything happened. */
  drain(until: number): boolean {
    let did = false;
    for (;;) {
      let index = -1;
      for (let i = 0; i < this.db.jobs.length; i++) {
        const job = this.db.jobs[i];
        if (job.at <= until && (index < 0 || job.at < this.db.jobs[index].at))
          index = i;
      }
      if (index < 0) break;
      const [job] = this.db.jobs.splice(index, 1);
      if (this.virtualNow !== null)
        this.virtualNow = Math.max(this.virtualNow, job.at);
      this.exec(job);
      did = true;
    }
    if (this.virtualNow !== null)
      this.virtualNow = Math.max(this.virtualNow, until);
    return did;
  }

  /** Called a few times a second while the page is open. */
  poll() {
    let did = this.drain(Date.now());
    for (const p of this.db.processes) {
      if (
        p.status === "sealed" &&
        p.nextRunAt &&
        new Date(p.nextRunAt).getTime() <= Date.now()
      ) {
        p.nextRunAt = this.nextRunAt(p.schedule);
        this.tick(p.id, "scheduled");
        did = true;
      }
    }
    if (did) this.save();
  }

  private exec(job: Job) {
    if (job.type === "propose") this.propose(job.interviewId);
    else if (job.type === "step") this.step(job.monsterRunId, job.n);
    else if (job.type === "tick") this.tick(job.processId, job.kind);
    else this.runEnd(job.runId);
  }

  // ───────────── lookups ─────────────

  private proc(id: Id): ProcRow {
    const p = this.db.processes.find((x) => x.id === id);
    if (!p) throw new LabError("Nothing by that name lives here.", "not_found");
    return p;
  }
  private monsterRun(id: Id | null): MonsterRun | undefined {
    return this.db.monsterRuns.find((x) => x.id === id);
  }
  private tool(name: string): Tool | undefined {
    return this.db.tools.find((x) => x.name === name);
  }
  private require(p: ProcRow, statuses: ProcRow["status"][], sentence: string) {
    if (!statuses.includes(p.status))
      throw new LabError(sentence, "state_changed");
  }

  // ───────────── reads ─────────────

  summary(p: ProcRow): ProcessSummary {
    const sessions = this.db.monsterRuns.filter((m) => m.processId === p.id);
    const tokens = sessions.reduce<TokenUsage>(
      (sum, m) => ({
        input: sum.input + m.tokens.input,
        output: sum.output + m.tokens.output,
        cached: sum.cached + m.tokens.cached,
        total: sum.total + m.tokens.total,
      }),
      ZERO,
    );
    const current = this.monsterRun(p.currentMonsterRunId);
    const last = this.db.runs.find(
      (r) =>
        r.processId === p.id &&
        r.status !== "running" &&
        r.status !== "pending",
    );
    return {
      id: p.id,
      interviewId: p.interviewId,
      position: p.position,
      name: p.name,
      description: p.description,
      successCriterion: p.successCriterion,
      status: p.status,
      repaired: p.repaired,
      sites: p.sites,
      schedule: p.schedule,
      nextRunAt: p.nextRunAt,
      lastRun: last
        ? {
            id: last.id,
            status: last.status,
            startedAt: last.startedAt,
            durationMs: last.durationMs,
            modelCalls: last.modelCalls,
          }
        : null,
      currentMonsterRunId: p.currentMonsterRunId,
      latestAction: current?.actions.at(-1) ?? null,
      tokens,
      reason: p.reason,
      createdAt: p.createdAt,
      sealedAt: p.sealedAt,
      retiredAt: p.retiredAt,
    };
  }

  detail(id: Id): ProcessDetail {
    const p = this.proc(id);
    return {
      ...this.summary(p),
      chain: p.chain,
      check: p.check,
      verificationRunId: p.verificationRunId,
      cause: p.cause,
      latestRepair: p.latestRepair,
      lastTick: this.db.ticks.find((t) => t.processId === id) ?? null,
      waitsFor: p.waitsFor,
      runs: this.db.runs.filter((r) => r.processId === id),
    };
  }

  listProcesses(): ProcessSummary[] {
    return this.db.processes.map((p) => this.summary(p));
  }

  listInterviews(): Interview[] {
    return [...this.db.interviews]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((row) => this.getInterview(row.id));
  }

  getInterview(id: Id): Interview {
    const row = this.db.interviews.find((x) => x.id === id);
    if (!row)
      throw new LabError("Nothing by that name lives here.", "not_found");
    return {
      ...row,
      processes: this.db.processes
        .filter((p) => p.interviewId === id)
        .sort((a, b) => a.position - b.position)
        .map((p) => this.summary(p)),
    };
  }

  getInvitation(): Invitation {
    return {
      sites: this.db.sites.map((s) => ({
        ...s,
        neededBy: this.db.processes
          .filter(
            (p) =>
              p.status !== "proposed" && p.sites.some((x) => x.site === s.site),
          )
          .map((p) => ({ id: p.id, name: p.name, status: p.status })),
      })),
    };
  }

  listTools(): ToolSummary[] {
    return this.db.tools.map((t) => ({
      name: t.name,
      description: t.description,
      sites: t.sites,
      kind: t.kind,
      createdBy: t.createdBy,
      usedBy: t.usedBy,
      currentVersion: t.currentVersion,
      repairCount: t.repairCount,
      codePath: t.codePath,
    }));
  }

  getTool(name: string): Tool {
    const tool = this.tool(name);
    if (!tool)
      throw new LabError("Nothing by that name lives here.", "not_found");
    return tool;
  }

  listRuns(processId?: Id, limit = 200): Run[] {
    return this.db.runs
      .filter((r) => !processId || r.processId === processId)
      .slice(0, limit);
  }

  listMonsterRuns(processId?: Id): MonsterRun[] {
    return this.db.monsterRuns.filter(
      (m) => !processId || m.processId === processId,
    );
  }

  // ───────────── interview ─────────────

  saveInterview(body: SaveInterviewRequest, readAfterMs = 6000): Interview {
    const row: InterviewRow = {
      id: this.id("interview"),
      status: "being_read",
      readError: null,
      language: body.language,
      startedAt: body.startedAt,
      endedAt: body.endedAt,
      transcript: body.transcript,
      invitedAt: null,
    };
    this.db.interviews.unshift(row);
    this.after(readAfterMs, { type: "propose", interviewId: row.id });
    return this.getInterview(row.id);
  }

  private propose(interviewId: Id) {
    const row = this.db.interviews.find((x) => x.id === interviewId);
    if (!row) return;
    const said = row.transcript
      .filter((t) => t.speaker === "user")
      .map((t) => t.text)
      .join(" ");
    if (/cannot be read/i.test(said)) {
      row.readError =
        "The reader stopped before it finished. (Simulated: the transcript says it cannot be read.)";
    } else if (said.trim().split(/\s+/).filter(Boolean).length < 8) {
      row.status = "nothing_found";
    } else {
      const keys = INTERVIEW_SETS[this.db.set % INTERVIEW_SETS.length];
      this.db.set += 1;
      keys.forEach((key, i) => this.makeProcess(key, interviewId, i + 1));
      row.status = "proposed";
    }
    this.emit({ kind: "interview.status", interviewId, status: row.status });
  }

  private makeProcess(key: string, interviewId: Id, position: number): ProcRow {
    const bp = BLUEPRINTS[key];
    const p: ProcRow = {
      id: this.id("process"),
      interviewId,
      position,
      name: bp.name,
      description: bp.description,
      successCriterion: bp.criterion,
      status: "proposed",
      repaired: false,
      sites: bp.sites.map((s) => SITES[s]),
      schedule: bp.schedule,
      nextRunAt: null,
      currentMonsterRunId: null,
      reason: null,
      createdAt: this.iso(),
      sealedAt: null,
      retiredAt: null,
      chain: [],
      check: null,
      verificationRunId: null,
      cause: null,
      latestRepair: null,
      waitsFor: null,
      key,
      inbox: 0,
      attempts: 0,
    };
    this.db.processes.push(p);
    return p;
  }

  removeProcess(id: Id) {
    const p = this.proc(id);
    this.require(
      p,
      ["proposed"],
      "It has already been invited, so it cannot be struck out.",
    );
    this.db.processes = this.db.processes.filter((x) => x.id !== id);
  }

  // ───────────── invitation ─────────────

  putInvitation(body: PutInvitationRequest): Invitation {
    const keep = new Set(body.sites.map((s) => s.site));
    for (const site of this.db.sites) {
      if (keep.has(site.site)) continue;
      const holders = this.db.processes.filter(
        (p) =>
          p.status !== "retired" &&
          p.status !== "proposed" &&
          p.sites.some((x) => x.site === site.site),
      );
      if (holders.length) {
        throw new LabError(
          `${site.site} is held by ${holders.map((p) => p.name).join(", ")}. Retire them first.`,
          "state_changed",
        );
      }
    }
    this.db.sites = body.sites.map((input) => {
      const had = this.db.sites.find((s) => s.site === input.site);
      const known = SITES[input.site];
      return {
        site: input.site,
        kind: input.kind,
        readOnly: known?.readOnly ?? input.kind === "connector",
        loginNeeded: known?.loginNeeded ?? input.kind === "website",
        // The login itself is dropped here: the simulation keeps only the fact.
        loginHeld:
          Boolean(input.login?.name && input.login.password) ||
          Boolean(had?.loginHeld),
        grantedAt: had?.grantedAt ?? this.iso(),
      };
    });
    return this.getInvitation();
  }

  startInterview(id: Id): Interview {
    const row = this.db.interviews.find((x) => x.id === id);
    if (!row)
      throw new LabError("Nothing by that name lives here.", "not_found");
    const proposed = this.db.processes
      .filter((p) => p.interviewId === id && p.status === "proposed")
      .sort((a, b) => a.position - b.position);
    if (!proposed.length)
      throw new LabError("Nothing is left to start.", "state_changed");
    for (const p of proposed) {
      for (const need of p.sites) {
        const site = this.db.sites.find((s) => s.site === need.site);
        if (!site)
          throw new LabError(
            `Missing: ${need.site}. ${p.name} needs it.`,
            "invalid",
          );
        if (site.loginNeeded && !site.loginHeld)
          throw new LabError(`${need.site} needs a login.`, "invalid");
      }
    }
    row.invitedAt = this.iso();
    for (const p of proposed) this.queue(p);
    this.pump();
    return this.getInterview(id);
  }

  // ───────────── learning ─────────────

  private newMonsterRun(p: ProcRow, kind: MonsterRun["kind"]): MonsterRun {
    const run: MonsterRun = {
      id: this.id("session"),
      processId: p.id,
      kind,
      status: "queued",
      startedAt: null,
      endedAt: null,
      model: "auto",
      tokens: { ...ZERO },
      toolsCreated: [],
      toolsReused: [],
      reason: null,
      actions: [],
      verification: [],
      failedRunId: null,
      repairId: null,
      refusals: [],
    };
    this.db.monsterRuns.unshift(run);
    p.currentMonsterRunId = run.id;
    return run;
  }

  private queue(p: ProcRow) {
    p.status = "queued";
    p.reason = null;
    p.attempts += 1;
    this.newMonsterRun(p, "learn");
    this.emit({ kind: "process.status", processId: p.id, status: "queued" });
  }

  /** Processes that share no site learn at once; the others wait, in the order described. */
  private pump() {
    const ahead = this.db.processes.filter(
      (p) => p.status === "learning" || p.status === "repairing",
    );
    const waiting = this.db.processes
      .filter((p) => p.status === "queued")
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.position - b.position,
      );
    for (const p of waiting) {
      let shared: string | null = null;
      const blocker = ahead.find((other) => {
        shared =
          p.sites.find((s) => other.sites.some((o) => o.site === s.site))
            ?.site ?? null;
        return shared !== null;
      });
      if (blocker) {
        p.waitsFor = {
          processId: blocker.id,
          processName: blocker.name,
          site: shared,
        };
      } else {
        this.startLearning(p);
      }
      ahead.push(p);
    }
  }

  private startLearning(p: ProcRow) {
    const session = this.monsterRun(p.currentMonsterRunId);
    if (!session) return;
    p.status = "learning";
    p.waitsFor = null;
    session.status = "running";
    session.startedAt = this.iso();
    this.db.scripts[session.id] = this.learnScript(p);
    this.after(700, { type: "step", monsterRunId: session.id, n: 0 });
    this.emit({ kind: "process.status", processId: p.id, status: "learning" });
    this.emit({
      kind: "monster.status",
      processId: p.id,
      monsterRunId: session.id,
      status: "running",
    });
  }

  private learnScript(p: ProcRow): Step[] {
    const bp = BLUEPRINTS[p.key];
    const steps: Step[] = [];
    const words = (tool: string) => tool.replace(/_/g, " ");
    if (bp.failFirst && p.attempts === 1) {
      const tool = bp.failFirst.tool;
      steps.push({
        t: "action",
        kind: "search_shelf",
        text: `Searched the Reliquary for "${words(tool)}". Found 0.`,
      });
      for (const [kind, text] of TOOLS[tool].explore)
        steps.push({ t: "action", kind, text });
      steps.push({
        t: "action",
        kind: "read",
        text: `Read a currency table from ${bp.failFirst.site} to convert the total.`,
      });
      steps.push({
        t: "action",
        kind: "save_process",
        text: "Saved the chain: 1 Relic and a Proof.",
      });
      steps.push({ t: "learn_failed" });
      return steps;
    }
    let made = 0;
    for (const tool of bp.chain) {
      const have = Boolean(this.tool(tool));
      steps.push({
        t: "action",
        kind: "search_shelf",
        text: `Searched the Reliquary for "${words(tool)}". Found ${have ? 1 : 0}.`,
      });
      if (have) {
        steps.push({ t: "reuse", tool });
      } else {
        made += 1;
        for (const [kind, text] of TOOLS[tool].explore)
          steps.push({ t: "action", kind, text });
        steps.push({ t: "create", tool });
        steps.push({
          t: "action",
          kind: "test_tool",
          text: `Tested ${tool}. Passed.`,
          tool,
        });
      }
    }
    steps.push({
      t: "action",
      kind: "save_process",
      text: `Saved the chain: ${bp.chain.length} Relics and a Proof.`,
    });
    for (const tool of bp.chain) {
      if (!this.tool(tool))
        steps.push({
          t: "verify",
          text: `Install check: ${tool} names only invited sites.`,
        });
    }
    if (!made)
      steps.push({
        t: "verify",
        text: "Install check: no new Relic to install.",
      });
    steps.push({
      t: "verify",
      text: "Ran the saved chain on a second example, with no model.",
    });
    steps.push({ t: "learned" });
    return steps;
  }

  private addAction(
    session: MonsterRun,
    kind: ActionKind,
    text: string,
    tool: string | null,
    spend: number,
  ) {
    const action: Action = {
      id: this.id("action"),
      at: this.iso(),
      kind,
      text,
      tool,
    };
    session.actions.push(action);
    const input = Math.round(spend * (260 + this.chance(1) * 520));
    const output = Math.round(spend * (60 + this.chance(2) * 110));
    const cached = Math.round(spend * (500 + this.chance(3) * 700));
    session.tokens = {
      input: session.tokens.input + input,
      output: session.tokens.output + output,
      cached: session.tokens.cached + cached,
      total: session.tokens.total + input + output + cached,
    };
    this.emit({
      kind: "monster.action",
      processId: session.processId,
      monsterRunId: session.id,
      action,
    });
    this.emit({
      kind: "monster.tokens",
      processId: session.processId,
      monsterRunId: session.id,
      tokens: session.tokens,
    });
  }

  private step(monsterRunId: Id, n: number) {
    const session = this.monsterRun(monsterRunId);
    const script = this.db.scripts[monsterRunId];
    if (!session || !script || session.status !== "running") return;
    const step = script[n];
    if (!step) return;
    const p = this.proc(session.processId);
    let wait = 520 + this.chance(4) * 420;

    if (step.t === "action") {
      this.addAction(session, step.kind, step.text, step.tool ?? null, 1);
    } else if (step.t === "create") {
      const bp = TOOLS[step.tool];
      const path = `shelf/${step.tool}/v1`;
      this.db.tools.push({
        name: step.tool,
        description: bp.description,
        sites: bp.sites,
        kind: bp.kind,
        createdBy: {
          processId: p.id,
          processName: p.name,
          monsterRunId: session.id,
          at: this.iso(),
        },
        usedBy: [{ processId: p.id, processName: p.name, origin: "made" }],
        currentVersion: 1,
        repairCount: 0,
        codePath: path,
        versions: [
          {
            version: 1,
            current: true,
            becameCurrentAt: this.iso(),
            origin: {
              kind: "learn",
              processId: p.id,
              processName: p.name,
              monsterRunId: session.id,
            },
            codePath: path,
            examples: [],
          },
        ],
        repairs: [],
      });
      session.toolsCreated.push(step.tool);
      this.addAction(
        session,
        "create_tool",
        `Made a new Relic: ${step.tool}.`,
        step.tool,
        2.4,
      );
      this.emit({
        kind: "tool.created",
        tool: step.tool,
        processId: p.id,
        monsterRunId: session.id,
      });
    } else if (step.t === "reuse") {
      const tool = this.tool(step.tool)!;
      if (!tool.usedBy.some((u) => u.processId === p.id)) {
        tool.usedBy.push({
          processId: p.id,
          processName: p.name,
          origin: "reused",
        });
      }
      session.toolsReused.push({
        tool: tool.name,
        madeForProcessId: tool.createdBy.processId,
        madeForProcessName: tool.createdBy.processName,
      });
      this.addAction(
        session,
        "reuse_tool",
        `Reused ${tool.name}, made for ${tool.createdBy.processName}.`,
        tool.name,
        0.3,
      );
      this.emit({
        kind: "tool.reused",
        tool: tool.name,
        processId: p.id,
        monsterRunId: session.id,
      });
    } else if (step.t === "verify") {
      const failing = script[n + 1]?.t === "unfixed";
      const line = {
        id: this.id("line"),
        at: this.iso(),
        text: step.text,
        outcome: failing ? ("failed" as const) : ("passed" as const),
      };
      session.verification.push(line);
      this.emit({
        kind: "monster.verification",
        processId: p.id,
        monsterRunId: session.id,
        line,
      });
      wait = 900;
    } else if (step.t === "learned") {
      this.finishLearning(p, session);
      return;
    } else if (step.t === "learn_failed") {
      this.failLearning(p, session);
      return;
    } else if (step.t === "repaired") {
      this.finishRepair(p, session, true);
      return;
    } else {
      this.finishRepair(p, session, false);
      return;
    }
    this.after(wait, { type: "step", monsterRunId, n: n + 1 });
  }

  private finishLearning(p: ProcRow, session: MonsterRun) {
    const bp = BLUEPRINTS[p.key];
    p.chain = bp.chain.map((name, i) => {
      const tool = this.tool(name)!;
      return {
        position: i + 1,
        tool: name,
        version: tool.currentVersion,
        kind: tool.kind,
        origin: session.toolsCreated.includes(name)
          ? ("made" as const)
          : ("reused" as const),
        description: tool.description,
      };
    });
    p.check = bp.check;
    const run = this.buildRun(
      p,
      "verification",
      PEOPLE[1],
      { kind: "pass" },
      [],
      null,
    );
    this.db.runs.unshift(run);
    p.verificationRunId = run.id;
    p.status = "awaiting_seal";
    session.status = "verified";
    session.endedAt = this.iso();
    delete this.db.scripts[session.id];
    this.emit({
      kind: "run.finished",
      processId: p.id,
      runId: run.id,
      status: "passed",
    });
    this.emit({
      kind: "monster.status",
      processId: p.id,
      monsterRunId: session.id,
      status: "verified",
    });
    this.emit({
      kind: "process.status",
      processId: p.id,
      status: "awaiting_seal",
    });
    this.pump();
  }

  private failLearning(p: ProcRow, session: MonsterRun) {
    const fail = BLUEPRINTS[p.key].failFirst!;
    const refusal: Refusal = {
      id: this.id("refusal"),
      site: fail.site,
      stage: "install",
      at: this.iso(),
      tool: fail.tool,
      version: 1,
      processId: p.id,
      processName: p.name,
      runId: null,
      monsterRunId: session.id,
    };
    session.refusals.push(refusal);
    session.verification.push({
      id: this.id("line"),
      at: this.iso(),
      text: `Install check: ${fail.tool} names ${fail.site}, which is not invited.`,
      outcome: "failed",
    });
    session.status = "failed";
    session.reason = fail.reason;
    session.endedAt = this.iso();
    p.status = "failed_to_learn";
    p.reason = fail.reason;
    delete this.db.scripts[session.id];
    this.emit({
      kind: "refusal",
      refusalId: refusal.id,
      site: refusal.site,
      processId: p.id,
      runId: null,
      monsterRunId: session.id,
      tool: fail.tool,
    });
    this.emit({
      kind: "monster.status",
      processId: p.id,
      monsterRunId: session.id,
      status: "failed",
    });
    this.emit({
      kind: "process.status",
      processId: p.id,
      status: "failed_to_learn",
    });
    this.pump();
  }

  learn(id: Id): ProcessDetail {
    const p = this.proc(id);
    this.require(
      p,
      ["failed_to_learn"],
      "It is no longer waiting to be raised again.",
    );
    this.queue(p);
    this.pump();
    return this.detail(id);
  }

  // ───────────── seal, schedule, retire ─────────────

  private nextRunAt(schedule: Schedule): string {
    const now = this.now();
    if (schedule.kind === "every")
      return new Date(now + schedule.minutes * 60_000).toISOString();
    const [h, m] = schedule.time.split(":").map(Number);
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return d.toISOString();
  }

  seal(id: Id): ProcessDetail {
    const p = this.proc(id);
    this.require(p, ["awaiting_seal"], "It is no longer awaiting your Seal.");
    p.status = "sealed";
    p.sealedAt = this.iso();
    p.nextRunAt = this.nextRunAt(p.schedule);
    const run = this.db.runs.find((r) => r.id === p.verificationRunId);
    if (run) {
      let input = run.itemFields;
      for (const step of run.steps) {
        const version = this.tool(step.tool)?.versions.find(
          (v) => v.version === step.version,
        );
        version?.examples.push({ input, result: step.result });
        input = step.result;
      }
    }
    this.emit({ kind: "process.status", processId: id, status: "sealed" });
    return this.detail(id);
  }

  setSchedule(id: Id, schedule: Schedule): ProcessDetail {
    const p = this.proc(id);
    if (p.status === "proposed" || p.status === "retired") {
      throw new LabError(
        "Its schedule cannot be changed now.",
        "state_changed",
      );
    }
    if (schedule.kind === "every") {
      if (
        !Number.isInteger(schedule.minutes) ||
        schedule.minutes < SCHEDULE_MINUTES_MIN ||
        schedule.minutes > SCHEDULE_MINUTES_MAX
      ) {
        throw new LabError(
          "Minutes must be a whole number from 1 to 1440.",
          "invalid",
        );
      }
    } else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time)) {
      throw new LabError(
        "Give the time as hours and minutes, for example 02:00.",
        "invalid",
      );
    }
    p.schedule = schedule;
    if (p.status === "sealed") p.nextRunAt = this.nextRunAt(schedule);
    this.emit({ kind: "process.status", processId: id, status: p.status });
    return this.detail(id);
  }

  retire(id: Id): ProcessDetail {
    const p = this.proc(id);
    if (p.status === "retired")
      throw new LabError("It is already retired.", "state_changed");
    const session = this.monsterRun(p.currentMonsterRunId);
    if (
      session &&
      (session.status === "queued" || session.status === "running")
    ) {
      session.status = "failed";
      session.reason = "The process was retired.";
      session.endedAt = this.iso();
      this.db.jobs = this.db.jobs.filter(
        (j) => !(j.type === "step" && j.monsterRunId === session.id),
      );
    }
    p.status = "retired";
    p.retiredAt = this.iso();
    p.nextRunAt = null;
    p.waitsFor = null;
    this.emit({ kind: "process.status", processId: id, status: "retired" });
    this.pump();
    return this.detail(id);
  }

  resume(id: Id): ProcessDetail {
    const p = this.proc(id);
    this.require(p, ["needs_human"], "It no longer needs a human.");
    p.status = "sealed";
    p.reason = null;
    p.cause = null;
    p.nextRunAt = this.nextRunAt(p.schedule);
    this.emit({ kind: "process.status", processId: id, status: "sealed" });
    return this.detail(id);
  }

  // ───────────── runs ─────────────

  runNow(id: Id): ProcessDetail {
    const p = this.proc(id);
    this.require(p, ["sealed"], "It can only run while it is sealed.");
    this.after(1300, { type: "tick", processId: id, kind: "run_now" });
    return this.detail(id);
  }

  private buildRun(
    p: ProcRow,
    kind: RunKind,
    person: Person,
    outcome: Outcome,
    extra: Fact[],
    tickId: Id | null,
  ): Run {
    const bp = BLUEPRINTS[p.key];
    const id = this.id("run");
    const stop = outcome.kind === "pass" ? Infinity : outcome.step;
    const steps: RunStep[] = p.chain.map((c) => {
      const base = {
        position: c.position,
        tool: c.tool,
        version: c.version,
        kind: c.kind,
      };
      if (c.position < stop) {
        return {
          ...base,
          status: "passed",
          result: TOOLS[c.tool].result(person),
          error: null,
        };
      }
      if (c.position === stop && outcome.kind === "refused") {
        return {
          ...base,
          status: "refused",
          result: [{ label: "Tried to reach", value: outcome.site }],
          error: `${outcome.site} is not in the Invitation.`,
        };
      }
      if (
        c.position === stop &&
        (outcome.kind === "fail_repair" || outcome.kind === "fail_human")
      ) {
        return { ...base, status: "failed", result: [], error: outcome.error };
      }
      return { ...base, status: "not_reached", result: [], error: null };
    });
    const failed = steps.find(
      (s) => s.status === "failed" || s.status === "refused",
    );
    const reached = steps.filter((s) => s.status !== "not_reached").length;
    const refusals: Refusal[] =
      outcome.kind === "refused" && failed
        ? [
            {
              id: this.id("refusal"),
              site: outcome.site,
              stage: "run",
              at: this.iso(),
              tool: failed.tool,
              version: failed.version,
              processId: p.id,
              processName: p.name,
              runId: id,
              monsterRunId: null,
            },
          ]
        : [];
    return {
      id,
      processId: p.id,
      tickId,
      kind,
      itemId: `${p.key}:${person.empId}:${kind === "verification" ? "v" : p.inbox}`,
      itemLabel: bp.label(person),
      itemFields: [...bp.itemFields(person), ...extra],
      status:
        outcome.kind === "pass"
          ? "passed"
          : outcome.kind === "refused"
            ? "refused"
            : "failed",
      startedAt: this.iso(),
      durationMs: 4200 + reached * 2100 + Math.round(this.chance(5) * 1800),
      modelCalls: 0,
      proofValue: outcome.kind === "pass" ? bp.proof(person) : null,
      steps,
      failedStep: failed?.position ?? null,
      error: failed?.error ?? null,
      refusals,
      repairId: null,
    };
  }

  private tick(processId: Id, kind: "scheduled" | "run_now") {
    const p = this.db.processes.find((x) => x.id === processId);
    if (!p || p.status !== "sealed") return;
    const bp = BLUEPRINTS[p.key];
    const index = p.inbox;
    p.inbox += 1;
    let item: Pending | null = null;
    if (index < bp.inbox.length) {
      const next = bp.inbox[index];
      item = {
        person: next.person,
        outcome: next.outcome,
        extra: next.extra ?? [],
      };
    } else {
      const beyond = index - bp.inbox.length;
      if (beyond % 2 === 1) {
        item = {
          person: PEOPLE[(7 + (beyond >> 1) + p.position) % PEOPLE.length],
          outcome: { kind: "pass" },
          extra: [],
        };
      }
    }
    const tick: Tick = {
      id: this.id("tick"),
      processId,
      at: this.iso(),
      kind,
      newItems: item ? 1 : 0,
    };
    this.db.ticks.unshift(tick);
    if (!item) {
      this.emit({
        kind: "tick.finished",
        processId,
        tickId: tick.id,
        newItems: 0,
      });
      return;
    }
    const final = this.buildRun(
      p,
      kind,
      item.person,
      item.outcome,
      item.extra,
      tick.id,
    );
    const running: Run = {
      ...final,
      status: "running",
      proofValue: null,
      failedStep: null,
      error: null,
      refusals: [],
      durationMs: 0,
      steps: final.steps.map((s, i) => ({
        ...s,
        status: i === 0 ? "running" : "not_reached",
        result: [],
        error: null,
      })),
    };
    this.db.runs.unshift(running);
    this.db.pending[final.id] = item;
    this.after(2400, { type: "run_end", runId: final.id });
    this.emit({ kind: "run.started", processId, runId: final.id });
  }

  private runEnd(runId: Id) {
    const index = this.db.runs.findIndex((r) => r.id === runId);
    const item = this.db.pending[runId];
    if (index < 0 || !item) return;
    const shown = this.db.runs[index];
    const p = this.proc(shown.processId);
    // Build the outcome under the id the running row already has.
    const final = {
      ...this.buildRun(
        p,
        shown.kind,
        item.person,
        item.outcome,
        item.extra,
        shown.tickId,
      ),
      id: runId,
    };
    final.refusals.forEach((r) => (r.runId = runId));
    final.itemId = shown.itemId;
    final.startedAt = shown.startedAt;
    this.db.runs[index] = final;
    delete this.db.pending[runId];
    this.emit({
      kind: "run.finished",
      processId: p.id,
      runId,
      status: final.status,
    });
    if (shown.tickId)
      this.emit({
        kind: "tick.finished",
        processId: p.id,
        tickId: shown.tickId,
        newItems: 1,
      });
    if (p.status !== "sealed") return;

    const outcome = item.outcome;
    if (outcome.kind === "refused") {
      const refusal = final.refusals[0];
      p.status = "needs_human";
      p.nextRunAt = null;
      p.reason = `A run tried to reach ${outcome.site}, which is not in the Invitation. It was stopped before anything left this machine.`;
      p.cause = { kind: "refusal", refusalId: refusal.id, runId };
      this.emit({
        kind: "refusal",
        refusalId: refusal.id,
        site: refusal.site,
        processId: p.id,
        runId,
        monsterRunId: null,
        tool: refusal.tool,
      });
      this.emit({
        kind: "process.status",
        processId: p.id,
        status: "needs_human",
      });
    } else if (outcome.kind !== "pass") {
      this.startRepair(p, final, item);
    }
  }

  // ───────────── repair ─────────────

  private startRepair(p: ProcRow, failed: Run, item: Pending) {
    const outcome = item.outcome;
    if (outcome.kind !== "fail_repair" && outcome.kind !== "fail_human") return;
    const step = failed.steps.find((s) => s.position === outcome.step)!;
    const tool = this.tool(step.tool)!;
    const next = tool.currentVersion + 1;
    p.status = "repairing";
    p.nextRunAt = null;
    const session = this.newMonsterRun(p, "repair");
    session.status = "running";
    session.startedAt = this.iso();
    session.failedRunId = failed.id;
    const examples = tool.versions[0]?.examples.length ?? 0;
    const script: Step[] = [
      {
        t: "action",
        kind: "read",
        text: `Read the failed run: step ${ROMAN[step.position]}, ${tool.name}.`,
      },
      { t: "action", kind: "read", text: `Read the error: ${outcome.error}` },
      {
        t: "action",
        kind: "search_shelf",
        text: `Searched the Reliquary for "${tool.name}". Found 1.`,
      },
      {
        t: "action",
        kind: "read",
        text: `Read the Relic and its ${examples} recorded examples.`,
      },
      {
        t: "action",
        kind: "read",
        text: `Read past repair records for ${tool.name}. Found ${tool.repairs.length || "none"}.`,
      },
    ];
    if (outcome.kind === "fail_repair") {
      script.push(
        {
          t: "action",
          kind: "read",
          text: "Compared the failing input with the recorded examples.",
        },
        {
          t: "action",
          kind: "create_tool",
          text: `Made version ${next} of ${tool.name}.`,
          tool: tool.name,
        },
        {
          t: "action",
          kind: "test_tool",
          text: `Tested ${tool.name} v${next} on the failed input. Passed.`,
          tool: tool.name,
        },
        {
          t: "action",
          kind: "test_tool",
          text: `Tested ${tool.name} v${next} on the recorded examples. Same results.`,
          tool: tool.name,
        },
        {
          t: "verify",
          text: `Install check: ${tool.name} v${next} names only invited sites.`,
        },
        {
          t: "verify",
          text: `Recorded examples reproduced by v${next}, with no model.`,
        },
        { t: "verify", text: "The failed item run again, with no model." },
        { t: "repaired" },
      );
    } else {
      script.push(
        {
          t: "action",
          kind: "open_page",
          text: `Opened ${tool.sites[0] ?? "the page"} to look for the employee by hand.`,
        },
        { t: "action", kind: "read", text: "Read the result table: no rows." },
        {
          t: "action",
          kind: "test_tool",
          text: `Tested ${tool.name} on the recorded examples. Passed: the Relic is not broken.`,
          tool: tool.name,
        },
        { t: "verify", text: "The failed item run again, with no model." },
        { t: "unfixed" },
      );
    }
    this.db.scripts[session.id] = script;
    this.db.pending[session.id] = item;
    this.after(900, { type: "step", monsterRunId: session.id, n: 0 });
    this.emit({ kind: "process.status", processId: p.id, status: "repairing" });
    this.emit({
      kind: "monster.status",
      processId: p.id,
      monsterRunId: session.id,
      status: "running",
    });
  }

  private finishRepair(p: ProcRow, session: MonsterRun, fixed: boolean) {
    const item = this.db.pending[session.id];
    const failed = this.db.runs.find((r) => r.id === session.failedRunId);
    delete this.db.pending[session.id];
    delete this.db.scripts[session.id];
    if (!item || !failed) return;
    const outcome = item.outcome;
    const step = failed.steps.find((s) => s.position === failed.failedStep)!;
    const tool = this.tool(step.tool)!;
    const from = tool.currentVersion;
    const repair: Repair = {
      id: this.id("repair"),
      tool: tool.name,
      processId: p.id,
      monsterRunId: session.id,
      fromVersion: from,
      toVersion: fixed ? from + 1 : null,
      failedRunId: failed.id,
      retryRunId: null,
      itemLabel: failed.itemLabel,
      whatFailed: failed.error ?? "The Relic failed.",
      whatChanged:
        outcome.kind === "fail_repair"
          ? outcome.whatChanged
          : "Nothing. The Relic does what it should; the input names someone who does not exist.",
      result: fixed ? "verified" : "not_fixed",
      reason: outcome.kind === "fail_human" ? outcome.reason : null,
      tokens: session.tokens,
      at: this.iso(),
    };
    session.repairId = repair.id;
    session.endedAt = this.iso();
    failed.repairId = repair.id;
    tool.repairs.unshift(repair);
    this.emit({
      kind: "repair.recorded",
      repairId: repair.id,
      tool: tool.name,
      processId: p.id,
    });

    if (!fixed) {
      session.status = "failed";
      session.reason = repair.reason;
      p.status = "needs_human";
      p.reason = repair.reason;
      p.cause = { kind: "run", runId: failed.id };
      this.emit({
        kind: "monster.status",
        processId: p.id,
        monsterRunId: session.id,
        status: "failed",
      });
      this.emit({
        kind: "process.status",
        processId: p.id,
        status: "needs_human",
      });
      this.pump();
      return;
    }

    const version = from + 1;
    const path = `shelf/${tool.name}/v${version}`;
    const examples = tool.versions[0]?.examples ?? [];
    tool.versions.forEach((v) => (v.current = false));
    tool.versions.unshift({
      version,
      current: true,
      becameCurrentAt: this.iso(),
      origin: { kind: "repair", repairId: repair.id, monsterRunId: session.id },
      codePath: path,
      examples: [...examples],
    });
    tool.currentVersion = version;
    tool.repairCount += 1;
    tool.codePath = path;
    for (const other of this.db.processes) {
      for (const c of other.chain)
        if (c.tool === tool.name) c.version = version;
    }
    const retry = this.buildRun(
      p,
      "after_repair",
      item.person,
      { kind: "pass" },
      item.extra,
      null,
    );
    retry.itemId = failed.itemId;
    this.db.runs.unshift(retry);
    repair.retryRunId = retry.id;
    session.status = "verified";
    p.status = "sealed";
    p.repaired = true;
    p.latestRepair = {
      id: repair.id,
      tool: tool.name,
      fromVersion: from,
      toVersion: version,
      at: repair.at,
    };
    p.nextRunAt = this.nextRunAt(p.schedule);
    this.emit({ kind: "tool.version_current", tool: tool.name, version });
    this.emit({
      kind: "run.finished",
      processId: p.id,
      runId: retry.id,
      status: "passed",
    });
    this.emit({
      kind: "monster.status",
      processId: p.id,
      monsterRunId: session.id,
      status: "verified",
    });
    this.emit({ kind: "process.status", processId: p.id, status: "sealed" });
    this.pump();
  }

  // ───────────── seeded scenarios ─────────────

  private seed(scenario: MockScenario) {
    if (scenario === "empty") return;
    const real = Date.now();
    const at = (msAgo: number) => {
      this.drain(real - msAgo);
      this.virtualNow = real - msAgo;
    };
    const interview = (minutesLong: number) =>
      this.saveInterview(
        {
          transcript: REFERENCE_TRANSCRIPT,
          language: "en",
          startedAt: new Date(this.now() - minutesLong * 60_000).toISOString(),
          endedAt: this.iso(),
        },
        800,
      );
    const invite = () =>
      this.putInvitation({
        sites: Object.values(SITES).map((s) => ({
          site: s.site,
          kind: s.kind,
          login: s.loginNeeded
            ? { name: "simulated", password: "simulated" }
            : undefined,
        })),
      });
    const idOf = (key: string) =>
      this.db.processes.find((p) => p.key === key)!.id;
    const run = (key: string) => {
      this.tick(idOf(key), "scheduled");
      this.drain(this.now() + 4 * 60_000);
    };
    const MIN = 60_000;

    if (scenario === "story") {
      // The interview has just ended and is being read; nothing else exists.
      this.virtualNow = real - 20_000;
      const made = interview(7);
      this.virtualNow = null;
      this.db.jobs = [
        { at: real + 7000, type: "propose", interviewId: made.id },
      ];
      return;
    }

    // full: a whole night already behind us, with every state on show.
    this.scale = 7;
    this.virtualNow = real - 185 * MIN;
    const first = interview(9);
    at(183 * MIN);
    invite();
    this.startInterview(first.id);
    at(150 * MIN);
    this.seal(idOf("hire"));
    at(140 * MIN);
    run("hire");
    at(96 * MIN);
    run("hire");
    at(92 * MIN);
    this.seal(idOf("leaver"));
    at(80 * MIN);
    run("leaver");
    at(47 * MIN);
    run("leaver");
    at(27 * MIN);
    const second = interview(6);
    at(26 * MIN);
    this.startInterview(second.id);
    this.retire(idOf("porter"));
    // Hold the second night's Familiars until just before the page opens.
    const held = this.db.jobs.filter((j) => j.type === "step");
    this.db.jobs = this.db.jobs.filter((j) => j.type !== "step");
    at(5 * MIN);
    interview(3);
    at(4 * MIN);
    at(70_000);
    for (const p of this.db.processes) {
      const session = this.monsterRun(p.currentMonsterRunId);
      if (p.status === "learning" && session) session.startedAt = this.iso();
    }
    this.db.jobs.push(...held.map((j) => ({ ...j, at: this.now() + 500 })));
    this.drain(real);
    this.virtualNow = null;
    this.scale = 1;
    for (const p of this.db.processes) {
      if (p.status === "sealed") p.nextRunAt = this.nextRunAt(p.schedule);
    }
  }
}

export { STORE_KEY };
