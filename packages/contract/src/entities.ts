/**
 * Entities and statuses shared by the web app and the lab service.
 *
 * Names follow the "DB/Code" column of the product overview's Terminology
 * table: a Familiar is a `monster`, a Relic is a `tool`, the Reliquary is the
 * `shelf`, a Proof is a `check`. Themed names exist only in the web app.
 *
 * Every time is an ISO 8601 string in UTC. Every duration is milliseconds.
 */

export type Id = string;
/** ISO 8601, UTC, for example "2026-10-08T21:04:11.000Z". */
export type IsoTime = string;

/** One labelled value, in display order. Used for step results, items and examples. */
export interface Fact {
  label: string;
  value: string;
}

// ───────────────────────── Statuses ─────────────────────────

export const INTERVIEW_STATUSES = [
  "being_read",
  "proposed",
  "nothing_found",
] as const;
export type InterviewStatus = (typeof INTERVIEW_STATUSES)[number];

export const PROCESS_STATUSES = [
  "proposed",
  "queued",
  "learning",
  "awaiting_seal",
  "failed_to_learn",
  "sealed",
  "repairing",
  "needs_human",
  "retired",
] as const;
export type ProcessStatus = (typeof PROCESS_STATUSES)[number];

export const RUN_STATUSES = [
  "pending",
  "running",
  "passed",
  "failed",
  "refused",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_KINDS = [
  "verification",
  "scheduled",
  "run_now",
  "after_repair",
] as const;
export type RunKind = (typeof RUN_KINDS)[number];

export const RUN_STEP_STATUSES = [
  "running",
  "passed",
  "failed",
  "refused",
  "not_reached",
] as const;
export type RunStepStatus = (typeof RUN_STEP_STATUSES)[number];

export const MONSTER_RUN_STATUSES = [
  "queued",
  "running",
  "verified",
  "failed",
] as const;
export type MonsterRunStatus = (typeof MONSTER_RUN_STATUSES)[number];

export const MONSTER_RUN_KINDS = ["learn", "repair"] as const;
export type MonsterRunKind = (typeof MONSTER_RUN_KINDS)[number];

/** Whether a tool only reads from its sites or also writes to them. */
export const TOOL_KINDS = ["reads", "writes"] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

/** Whether a process's monster created a tool or found it on the shelf. */
export const TOOL_ORIGINS = ["made", "reused"] as const;
export type ToolOrigin = (typeof TOOL_ORIGINS)[number];

export const SITE_KINDS = ["website", "connector"] as const;
export type SiteKind = (typeof SITE_KINDS)[number];

export const ACTION_KINDS = [
  "search_shelf",
  "open_page",
  "click",
  "type",
  "read",
  "reuse_tool",
  "create_tool",
  "test_tool",
  "save_process",
  "refused",
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export const REFUSAL_STAGES = ["install", "run", "explore"] as const;
/** install: the install check. run: a model-free run. explore: a monster's browser. */
export type RefusalStage = (typeof REFUSAL_STAGES)[number];

export const REPAIR_RESULTS = ["verified", "not_fixed"] as const;
export type RepairResult = (typeof REPAIR_RESULTS)[number];

/** The process statuses in which a monster is spending tokens. */
export const WORKING_STATUSES: readonly ProcessStatus[] = [
  "learning",
  "repairing",
];

// ───────────────────────── Interview ─────────────────────────

export const SPEAKERS = ["agent", "user"] as const;
export type Speaker = (typeof SPEAKERS)[number];

export interface TranscriptTurn {
  speaker: Speaker;
  text: string;
}

export interface Interview {
  id: Id;
  status: InterviewStatus;
  /**
   * One sentence, set when the orchestrator could not read the transcript.
   * The status stays "being_read"; the web app offers to save it again.
   */
  readError: string | null;
  /** BCP 47 language tag of the conversation, for example "cs" or "en". */
  language: string;
  startedAt: IsoTime;
  endedAt: IsoTime;
  transcript: TranscriptTurn[];
  /** When "invite and start" queued its processes; null until then. */
  invitedAt: IsoTime | null;
  /** In the order they were described. Removed proposals are not listed. */
  processes: ProcessSummary[];
}

// ───────────────────────── Sites and the invitation ─────────────────────────

/** A site or connector a process needs. */
export interface SiteRef {
  /** Host name for a website ("parabank.parasoft.com"), connector name for a connector ("gmail"). */
  site: string;
  kind: SiteKind;
  /** Connectors are read-only in this version; shown as "mailbox, read only". */
  readOnly: boolean;
  loginNeeded: boolean;
  /**
   * Set on a process's sites: whether the lab already holds a login for it,
   * so the invitation form need not ask. The login itself is never returned.
   */
  loginHeld?: boolean;
}

export interface InvitationSite extends SiteRef {
  /** Whether the lab service holds a login. The login itself is never returned. */
  loginHeld: boolean;
  grantedAt: IsoTime;
  /** Every process that needs this site, retired ones included. */
  neededBy: ProcessRef[];
}

export interface Invitation {
  sites: InvitationSite[];
}

export interface ProcessRef {
  id: Id;
  name: string;
  status: ProcessStatus;
}

// ───────────────────────── Schedule and ticks ─────────────────────────

export type Schedule =
  /** Every day at a local time, "HH:MM" in 24-hour form. */
  | { kind: "daily"; time: string }
  /** Every N minutes, 1 to 1440. */
  | { kind: "every"; minutes: number };

export const SCHEDULE_MINUTES_MIN = 1;
export const SCHEDULE_MINUTES_MAX = 1440;

/** One time the runner looked for new work for a process. */
export interface Tick {
  id: Id;
  processId: Id;
  at: IsoTime;
  /** What started it. */
  kind: "scheduled" | "run_now";
  /** Zero is "nothing new". */
  newItems: number;
}

// ───────────────────────── Process ─────────────────────────

export interface TokenUsage {
  input: number;
  output: number;
  cached: number;
  /** input + output + cached. */
  total: number;
}

export interface LastRun {
  id: Id;
  status: RunStatus;
  startedAt: IsoTime;
  durationMs: number;
  modelCalls: number;
}

export interface ProcessSummary {
  id: Id;
  interviewId: Id;
  /** Order in which the person described it, starting at 1. */
  position: number;
  name: string;
  description: string;
  /** How the person said they know it worked, in their words. */
  successCriterion: string;
  status: ProcessStatus;
  /** True from the first verified repair onward. */
  repaired: boolean;
  sites: SiteRef[];
  schedule: Schedule;
  /** Null unless sealed. */
  nextRunAt: IsoTime | null;
  lastRun: LastRun | null;
  /** The monster run now working or last finished for this process. */
  currentMonsterRunId: Id | null;
  /** The newest action of the current monster run. */
  latestAction: Action | null;
  /** Tokens spent by every monster run of this process so far. */
  tokens: TokenUsage;
  /** One sentence. Set for failed_to_learn and needs_human. */
  reason: string | null;
  createdAt: IsoTime;
  sealedAt: IsoTime | null;
  retiredAt: IsoTime | null;
}

export interface ChainStep {
  /** Starting at 1. */
  position: number;
  tool: string;
  version: number;
  kind: ToolKind;
  /** Whether this process's monster made the tool or reused it. */
  origin: ToolOrigin;
  description: string;
}

/** The check: the value that must be present for a run to pass. */
export interface Check {
  /** Short name of the value, for example "Employee id". */
  name: string;
  /** What must be present, as one sentence. */
  description: string;
}

/** Why a process needs a human. */
export type HumanCause =
  | { kind: "run"; runId: Id }
  | { kind: "refusal"; refusalId: Id; runId: Id | null };

export interface LatestRepair {
  id: Id;
  tool: string;
  fromVersion: number;
  toVersion: number;
  at: IsoTime;
}

/** What a queued process waits for. Null fields mean "a free monster". */
export interface WaitsFor {
  processId: Id | null;
  processName: string | null;
  site: string | null;
}

export interface ProcessDetail extends ProcessSummary {
  /** Empty until the monster saved the process. */
  chain: ChainStep[];
  check: Check | null;
  verificationRunId: Id | null;
  /** Set while needs_human. */
  cause: HumanCause | null;
  latestRepair: LatestRepair | null;
  lastTick: Tick | null;
  /** Set while queued. */
  waitsFor: WaitsFor | null;
  /** Newest first. */
  runs: Run[];
}

// ───────────────────────── Runs ─────────────────────────

export interface RunStep {
  position: number;
  tool: string;
  version: number;
  kind: ToolKind;
  status: RunStepStatus;
  result: Fact[];
  /** Set when the step failed. */
  error: string | null;
}

/** One model-free execution of a process for one item. */
export interface Run {
  id: Id;
  processId: Id;
  tickId: Id | null;
  kind: RunKind;
  /** Stable identity of the item, for example a message id. */
  itemId: string;
  /** Human-readable, for example "Email: New hire, Ana Novak". */
  itemLabel: string;
  /** The item's own fields, shown as "the example" before sealing. */
  itemFields: Fact[];
  status: RunStatus;
  startedAt: IsoTime;
  durationMs: number;
  /** Reported by the runner. Always 0; the web app prints what it is given. */
  modelCalls: number;
  /** The value of the check; null when it was not present. */
  proofValue: string | null;
  steps: RunStep[];
  /** Position of the failing or refused step. */
  failedStep: number | null;
  error: string | null;
  refusals: Refusal[];
  /** The repair this failure led to, once one is recorded. */
  repairId: Id | null;
}

// ───────────────────────── Monster runs ─────────────────────────

export interface Action {
  id: Id;
  at: IsoTime;
  kind: ActionKind;
  /** One sentence, ready to show. Never contains a login. */
  text: string;
  /** The tool involved, for reuse_tool, create_tool and test_tool. */
  tool: string | null;
}

/** One line of the service's own verification, done without the monster. */
export interface VerificationLine {
  id: Id;
  at: IsoTime;
  text: string;
  outcome: "pending" | "passed" | "failed";
}

export interface ReusedTool {
  tool: string;
  /** The process whose monster made it. */
  madeForProcessId: Id;
  madeForProcessName: string;
}

/** One session of a monster: learning a process or repairing a tool. */
export interface MonsterRun {
  id: Id;
  processId: Id;
  kind: MonsterRunKind;
  status: MonsterRunStatus;
  /** Null while queued. */
  startedAt: IsoTime | null;
  endedAt: IsoTime | null;
  model: string;
  tokens: TokenUsage;
  toolsCreated: string[];
  toolsReused: ReusedTool[];
  /** One sentence, on failure. */
  reason: string | null;
  /** Stored and ordered, oldest first, so a reload loses nothing. */
  actions: Action[];
  verification: VerificationLine[];
  /** For a repair: the run that failed. */
  failedRunId: Id | null;
  /** For a repair: the record it produced. */
  repairId: Id | null;
  refusals: Refusal[];
}

// ───────────────────────── Shelf ─────────────────────────

export interface ToolMaker {
  processId: Id;
  processName: string;
  monsterRunId: Id;
  at: IsoTime;
}

export interface ToolUser {
  processId: Id;
  processName: string;
  origin: ToolOrigin;
}

export interface ToolSummary {
  /** Unique on the shelf; the tool's address. */
  name: string;
  description: string;
  sites: string[];
  kind: ToolKind;
  createdBy: ToolMaker;
  usedBy: ToolUser[];
  currentVersion: number;
  /** How many repairs this tool has had. */
  repairCount: number;
  /** Folder of the current version on disk, as text. */
  codePath: string;
}

export interface RecordedExample {
  input: Fact[];
  result: Fact[];
}

export interface ToolVersion {
  version: number;
  current: boolean;
  becameCurrentAt: IsoTime;
  origin:
    | { kind: "learn"; processId: Id; processName: string; monsterRunId: Id }
    | { kind: "repair"; repairId: Id; monsterRunId: Id };
  codePath: string;
  examples: RecordedExample[];
}

export interface Repair {
  id: Id;
  tool: string;
  processId: Id;
  monsterRunId: Id;
  fromVersion: number;
  /** Null when the repair did not produce a version that verified. */
  toVersion: number | null;
  failedRunId: Id;
  /** The "after repair" run that passed, when there is one. */
  retryRunId: Id | null;
  /** Label of the item the run failed on. */
  itemLabel: string;
  /** The error, in one or two sentences. */
  whatFailed: string;
  /** The monster's description of its change. */
  whatChanged: string;
  result: RepairResult;
  /** One sentence, when not fixed. */
  reason: string | null;
  tokens: TokenUsage;
  at: IsoTime;
}

export interface Tool extends ToolSummary {
  /** Newest first. */
  versions: ToolVersion[];
  /** Newest first. */
  repairs: Repair[];
}

// ───────────────────────── Refusals ─────────────────────────

/** One attempt to reach a site or connector outside the invitation. */
export interface Refusal {
  id: Id;
  site: string;
  stage: RefusalStage;
  at: IsoTime;
  /** What tried. */
  tool: string | null;
  version: number | null;
  processId: Id;
  processName: string;
  runId: Id | null;
  monsterRunId: Id | null;
}
