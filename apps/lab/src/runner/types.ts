import type { MailSettings } from "../connectors/types.ts";
import type { InvitationScope, ToolMeta, ToolVersion } from "../shelf/types.ts";

export interface Login {
  username: string;
  password: string;
}

/** The invitation and the process must both allow a declared capability. */
export interface RunScope {
  invitation: InvitationScope;
  process: InvitationScope;
  logins?: Readonly<Record<string, Login>>;
}

export interface Item {
  id: string;
  label: string;
  data: Record<string, unknown>;
}

export interface ChainStep {
  id: string;
  tool: string;
  /** Omit to use the tool's current shelf version. */
  version?: number;
  input: Record<string, unknown>;
}

export interface Chain {
  steps: ChainStep[];
  check: string;
}

export interface Refusal {
  site: string;
  url: string;
  tool: string;
  version: number;
  kind: "navigation" | "scope";
}

export interface StepResult {
  id: string;
  tool: string;
  version: number;
  status: "passed" | "failed" | "refused";
  durationMs: number;
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  logs: string[];
  refusals: Refusal[];
  blockedBackgroundRequests: number;
}

export interface ListItemsResult {
  status: "passed" | "failed" | "refused";
  tool: string;
  version: number;
  durationMs: number;
  items: Item[];
  error: string | null;
  logs: string[];
  refusals: Refusal[];
  blockedBackgroundRequests: number;
  modelCalls: 0;
}

export interface RunResult {
  status: "passed" | "failed" | "refused";
  steps: StepResult[];
  proofValue: string | null;
  failedStep: number | null;
  error: string | null;
  refusals: Refusal[];
  modelCalls: 0;
}

export interface ReplayResult {
  status: "passed" | "failed" | "refused";
  tool: string;
  version: number;
  durationMs: number;
  result: Record<string, unknown> | null;
  error: string | null;
  logs: string[];
  refusals: Refusal[];
  blockedBackgroundRequests: number;
  modelCalls: 0;
}

export interface RunnerOptions {
  shelfDir: string;
  headless?: boolean;
  stepTimeoutMs?: number;
  runTimeoutMs?: number;
  /** Mailbox settings for the gmail connector. Omit to read LAB_MAIL_* from the environment; null for none. */
  mail?: MailSettings | null;
}

export interface PreparedStep extends Omit<ChainStep, "version"> {
  version: number;
  toolVersion: ToolVersion;
}

export interface WorkerTool {
  name: string;
  version: number;
  codePath: string;
  meta: ToolMeta;
}
