/**
 * Request and response shapes for every endpoint in the product overview's
 * API Surface table. All bodies are JSON.
 *
 * A refused command answers with a non-2xx status and an `ApiError` body.
 */

import type {
  Id,
  Interview,
  Invitation,
  MonsterRun,
  ProcessDetail,
  ProcessSummary,
  Run,
  Schedule,
  SiteKind,
  Tool,
  ToolSummary,
  TranscriptTurn,
} from "./entities.ts";

/** Default address of the lab service on the user's machine. */
export const DEFAULT_LAB_URL = "http://localhost:4000";

/** Path builders. The web app's http client and the lab service's routes both use these. */
export const PATHS = {
  health: "/health",
  events: "/events",
  interviews: "/interviews",
  interview: (id: Id) => `/interviews/${encodeURIComponent(id)}`,
  interviewStart: (id: Id) => `/interviews/${encodeURIComponent(id)}/start`,
  invitation: "/invitation",
  processes: "/processes",
  process: (id: Id) => `/processes/${encodeURIComponent(id)}`,
  processLearn: (id: Id) => `/processes/${encodeURIComponent(id)}/learn`,
  processSeal: (id: Id) => `/processes/${encodeURIComponent(id)}/seal`,
  processRun: (id: Id) => `/processes/${encodeURIComponent(id)}/run`,
  processResume: (id: Id) => `/processes/${encodeURIComponent(id)}/resume`,
  processSchedule: (id: Id) => `/processes/${encodeURIComponent(id)}/schedule`,
  processRetire: (id: Id) => `/processes/${encodeURIComponent(id)}/retire`,
  tools: "/tools",
  tool: (name: string) => `/tools/${encodeURIComponent(name)}`,
  runs: "/runs",
  monsterRuns: "/monster-runs",
} as const;

// ───────────────────────── Errors ─────────────────────────

export const ERROR_CODES = [
  /** The record is no longer in the state the command needs (HTTP 409). */
  "state_changed",
  /** No such record (HTTP 404). */
  "not_found",
  /** The request itself is wrong, for example a schedule out of range (HTTP 400). */
  "invalid",
  /** Anything else (HTTP 500). */
  "internal",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiError {
  /** One sentence, fit to show the user as it is. */
  error: string;
  code: ErrorCode;
}

// ───────────────────────── GET /health ─────────────────────────

export interface HealthResponse {
  /** The service answered. */
  service: "ok";
  /** Whether the service reached its database. */
  database: "ok" | "error";
}

// ───────────────────────── Interviews ─────────────────────────

/** POST /interviews */
export interface SaveInterviewRequest {
  /** Ordered turns, spoken or typed. */
  transcript: TranscriptTurn[];
  /** BCP 47 language tag. */
  language: string;
  startedAt: string;
  endedAt: string;
  /** The interview this one continues, when opened with ?from=. */
  continuedFrom?: Id;
}
/**
 * Returns at once with status "being_read" and no processes. The proposals
 * follow as an "interview.status" event; the app then reads the interview.
 */
export type SaveInterviewResponse = Interview;

/** GET /interviews — newest first. */
export interface ListInterviewsResponse {
  interviews: Interview[];
}

/** GET /interviews/:id */
export type GetInterviewResponse = Interview;

/** POST /interviews/:id/start — queues every remaining proposed process. */
export interface StartInterviewResponse {
  interview: Interview;
}

// ───────────────────────── Invitation ─────────────────────────

/** GET /invitation — never returns a login. */
export type GetInvitationResponse = Invitation;

export interface Login {
  name: string;
  password: string;
}

export interface InvitationSiteInput {
  site: string;
  kind: SiteKind;
  /** Omitted: the login already held for this site is kept. */
  login?: Login;
}

/**
 * PUT /invitation — the complete set of invited sites. A site that is left
 * out is withdrawn; the service refuses that while an unretired process needs it.
 */
export interface PutInvitationRequest {
  sites: InvitationSiteInput[];
}
export type PutInvitationResponse = Invitation;

// ───────────────────────── Processes ─────────────────────────

/** GET /processes — every process, retired ones included. */
export interface ListProcessesResponse {
  processes: ProcessSummary[];
}

/** GET /processes/:id */
export type GetProcessResponse = ProcessDetail;

/** DELETE /processes/:id — only while proposed. */
export interface RemoveProcessResponse {
  removed: true;
}

/**
 * POST /processes/:id/learn   — only from failed_to_learn.
 * POST /processes/:id/seal    — only from awaiting_seal.
 * POST /processes/:id/run     — only when sealed. Returns at once; the tick's
 *                               outcome follows as a "tick.finished" event.
 * POST /processes/:id/resume  — only from needs_human. Sets the stuck item aside.
 * POST /processes/:id/retire  — from any state but retired.
 * None takes a body. Each answers with the process as it now is.
 */
export type ProcessCommandResponse = ProcessDetail;

/** PUT /processes/:id/schedule */
export interface PutScheduleRequest {
  schedule: Schedule;
}
export type PutScheduleResponse = ProcessDetail;

// ───────────────────────── Shelf ─────────────────────────

/** GET /tools — in the order they were made, oldest first. */
export interface ListToolsResponse {
  tools: ToolSummary[];
}

/** GET /tools/:name */
export type GetToolResponse = Tool;

// ───────────────────────── Runs and monster runs ─────────────────────────

/** GET /runs — newest first. Refusals are inside the runs they belong to. */
export interface ListRunsQuery {
  processId?: Id;
  /** Default 200. */
  limit?: number;
}
export interface ListRunsResponse {
  runs: Run[];
}

/** GET /monster-runs — newest first, each with its stored actions. */
export interface ListMonsterRunsQuery {
  processId?: Id;
}
export interface ListMonsterRunsResponse {
  monsterRuns: MonsterRun[];
}
