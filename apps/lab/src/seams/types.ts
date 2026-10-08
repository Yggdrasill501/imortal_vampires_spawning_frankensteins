import type {
  ActionKind,
  Fact,
  RefusalStage,
  RunStatus,
  Schedule,
  SiteKind,
  ToolKind,
  TranscriptTurn,
} from "@repo/contract";

export type StopSignal = AbortSignal;

export interface ProcessProposal {
  name: string;
  description: string;
  successCriterion: string;
  sites: Array<{ site: string; kind: SiteKind; loginNeeded: boolean }>;
  schedule: Schedule;
}

export interface OrchestratorSeam {
  propose(input: {
    interviewId: string;
    transcript: TranscriptTurn[];
    language: string;
    model: string;
    signal: StopSignal;
  }): Promise<{ proposals: ProcessProposal[] } | { error: string }>;
}

export interface MonsterHooks {
  readShelf(): Promise<
    Array<{
      name: string;
      description: string;
      sites: string[];
      kind: ToolKind;
      currentVersion: number;
      folder: string;
    }>
  >;
  recordAction(kind: ActionKind, text: string, toolName?: string): Promise<void | { error: string }>;
  reportTokens(tokens: { input: number; output: number; cached: number }): Promise<void>;
  createTool(draftFolder: string): Promise<void | { error: string }>;
  takeTool(name: string): Promise<void | { error: string }>;
  saveProcess(
    tools: string[],
    check: { name: string; description: string },
  ): Promise<void | { error: string }>;
  submitRepair(draftFolder: string): Promise<void | { error: string }>;
}

export interface MonsterSeam {
  work(input: {
    monsterRunId: string;
    processId: string;
    kind: "learn" | "repair";
    workspace: string;
    model: string;
    agentEnvironment: NodeJS.ProcessEnv;
    hooks: MonsterHooks;
    signal: StopSignal;
  }): Promise<
    | { outcome: "done"; learnedOnItemId?: string; whatChanged?: string }
    | { outcome: "gave_up"; error: string }
  >;
}

export interface ShelfSeam {
  check(
    folder: string,
    invitedSites: readonly string[],
    signal: StopSignal,
  ): Promise<
    | { passed: true; name: string; description: string; sites: string[]; kind: ToolKind }
    | { passed: false; error: string; uninvitedSites: string[] }
  >;
}

export interface ListedItem {
  id: string;
  label: string;
  fields: Fact[];
}

export interface RunHooks {
  stepStarted(position: number, input: Fact[]): Promise<void>;
  stepEnded(input: {
    position: number;
    status: "passed" | "failed" | "refused";
    result?: Fact[];
    error?: string;
  }): Promise<void>;
}

export interface RunnerSeam {
  listItems(input: {
    processId: string;
    signal: StopSignal;
  }): Promise<{ items: ListedItem[] } | { error: string }>;
  runItem(input: {
    runId: string;
    processId: string;
    item: ListedItem;
    hooks: RunHooks;
    signal: StopSignal;
  }): Promise<{
    status: Extract<RunStatus, "passed" | "failed" | "refused">;
    proofValue: string | null;
    failedStep: number | null;
    error: string | null;
    modelCalls: number;
  }>;
  replay(input: {
    folder: string;
    args: Fact[];
    signal: StopSignal;
  }): Promise<{ result: Fact[] } | { error: string }>;
}

export interface SchedulingSeam {
  nextRunAt(schedule: Schedule, after: Date, signal: StopSignal): Promise<Date | null>;
}

export interface Seams {
  orchestrator: OrchestratorSeam;
  monster: MonsterSeam;
  shelf: ShelfSeam;
  runner: RunnerSeam;
  scheduling: SchedulingSeam;
}
