import type {
  ErrorCode,
  HealthResponse,
  Id,
  Interview,
  Invitation,
  LabEvent,
  ListMonsterRunsQuery,
  ListRunsQuery,
  MonsterRun,
  ProcessDetail,
  ProcessSummary,
  PutInvitationRequest,
  Run,
  SaveInterviewRequest,
  Schedule,
  Tool,
  ToolSummary,
} from "@repo/contract";

/** A refusal or failure from the lab service, with a sentence fit to show. */
export class LabError extends Error {
  code: ErrorCode | "unreachable";
  constructor(message: string, code: ErrorCode | "unreachable" = "internal") {
    super(message);
    this.name = "LabError";
    this.code = code;
  }
}

export const UNREACHABLE = "The lab did not answer.";

/**
 * connecting: first attempt, nothing known yet.
 * live: events are arriving.
 * dropped: was live, now retrying.
 * unreachable: never reached since the page loaded, retrying.
 */
export type ConnectionState = "connecting" | "live" | "dropped" | "unreachable";

export type MockScenario = "empty" | "story" | "full";

/** Controls that exist only in the simulation. Never used by a screen. */
export interface MockControls {
  scenario: MockScenario;
  restart(scenario: MockScenario): void;
  setLineCut(cut: boolean): void;
  isLineCut(): boolean;
}

/**
 * The one way the web app reaches the lab service. Two implementations:
 * `http` (the real service) and `mock` (an in-browser simulation).
 * Each method is one endpoint of the overview's API Surface.
 */
export interface LabClient {
  readonly mode: "http" | "mock";
  /** Present only in mock mode; used by the "Simulated data" marker. */
  readonly mock?: MockControls;

  health(): Promise<HealthResponse>;

  saveInterview(body: SaveInterviewRequest): Promise<Interview>;
  getInterview(id: Id): Promise<Interview>;
  startInterview(id: Id): Promise<Interview>;

  getInvitation(): Promise<Invitation>;
  putInvitation(body: PutInvitationRequest): Promise<Invitation>;

  listProcesses(): Promise<ProcessSummary[]>;
  getProcess(id: Id): Promise<ProcessDetail>;
  removeProcess(id: Id): Promise<void>;
  learn(id: Id): Promise<ProcessDetail>;
  seal(id: Id): Promise<ProcessDetail>;
  runNow(id: Id): Promise<ProcessDetail>;
  resume(id: Id): Promise<ProcessDetail>;
  retire(id: Id): Promise<ProcessDetail>;
  setSchedule(id: Id, schedule: Schedule): Promise<ProcessDetail>;

  listTools(): Promise<ToolSummary[]>;
  getTool(name: string): Promise<Tool>;

  listRuns(query?: ListRunsQuery): Promise<Run[]>;
  listMonsterRuns(query?: ListMonsterRunsQuery): Promise<MonsterRun[]>;

  /**
   * Opens the live event stream and keeps it open, retrying after 1, 2 and 5
   * seconds and then every 5 seconds. Returns a function that closes it.
   */
  subscribe(
    onEvent: (event: LabEvent) => void,
    onState: (state: ConnectionState) => void,
  ): () => void;
}
