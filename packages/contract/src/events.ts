/**
 * Live events: GET /events is a server-sent event stream.
 *
 * Each message is one `data:` line holding one JSON `LabEvent`. The SSE `id:`
 * field carries the event's id, and the service sends a comment line (":")
 * at least every 15 seconds so a quiet stream is not mistaken for a dead one.
 *
 * Events tell the web app what to append and what to read again. They are
 * never the source of a status: the app re-reads the record an event names.
 */

import type {
  Action,
  Id,
  InterviewStatus,
  IsoTime,
  MonsterRunStatus,
  ProcessStatus,
  RunStatus,
  TokenUsage,
  VerificationLine,
} from "./entities.ts";

export const EVENT_KINDS = [
  "interview.status",
  "process.status",
  "monster.action",
  "monster.verification",
  "monster.status",
  "monster.tokens",
  "tool.created",
  "tool.reused",
  "tool.version_current",
  "run.started",
  "run.finished",
  "tick.finished",
  "refusal",
  "repair.recorded",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

interface EventBase {
  id: Id;
  at: IsoTime;
}

/** The orchestrator finished (or failed) reading an interview. */
export interface InterviewStatusEvent extends EventBase {
  kind: "interview.status";
  interviewId: Id;
  status: InterviewStatus;
}

export interface ProcessStatusEvent extends EventBase {
  kind: "process.status";
  processId: Id;
  status: ProcessStatus;
}

/** Carries the action so the list can grow without a read. */
export interface MonsterActionEvent extends EventBase {
  kind: "monster.action";
  processId: Id;
  monsterRunId: Id;
  action: Action;
}

/** A new or updated line of the service's own verification. */
export interface MonsterVerificationEvent extends EventBase {
  kind: "monster.verification";
  processId: Id;
  monsterRunId: Id;
  line: VerificationLine;
}

export interface MonsterStatusEvent extends EventBase {
  kind: "monster.status";
  processId: Id;
  monsterRunId: Id;
  status: MonsterRunStatus;
}

export interface MonsterTokensEvent extends EventBase {
  kind: "monster.tokens";
  processId: Id;
  monsterRunId: Id;
  tokens: TokenUsage;
}

export interface ToolCreatedEvent extends EventBase {
  kind: "tool.created";
  tool: string;
  processId: Id;
  monsterRunId: Id;
}

export interface ToolReusedEvent extends EventBase {
  kind: "tool.reused";
  tool: string;
  processId: Id;
  monsterRunId: Id;
}

export interface ToolVersionCurrentEvent extends EventBase {
  kind: "tool.version_current";
  tool: string;
  version: number;
}

export interface RunStartedEvent extends EventBase {
  kind: "run.started";
  processId: Id;
  runId: Id;
}

export interface RunFinishedEvent extends EventBase {
  kind: "run.finished";
  processId: Id;
  runId: Id;
  status: RunStatus;
}

export interface TickFinishedEvent extends EventBase {
  kind: "tick.finished";
  processId: Id;
  tickId: Id;
  newItems: number;
}

export interface RefusalEvent extends EventBase {
  kind: "refusal";
  refusalId: Id;
  site: string;
  processId: Id;
  runId: Id | null;
  monsterRunId: Id | null;
  tool: string | null;
}

export interface RepairRecordedEvent extends EventBase {
  kind: "repair.recorded";
  repairId: Id;
  tool: string;
  processId: Id;
}

export type LabEvent =
  | InterviewStatusEvent
  | ProcessStatusEvent
  | MonsterActionEvent
  | MonsterVerificationEvent
  | MonsterStatusEvent
  | MonsterTokensEvent
  | ToolCreatedEvent
  | ToolReusedEvent
  | ToolVersionCurrentEvent
  | RunStartedEvent
  | RunFinishedEvent
  | TickFinishedEvent
  | RefusalEvent
  | RepairRecordedEvent;
