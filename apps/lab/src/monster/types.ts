import type { MailSettings } from "../connectors/types.ts";
import type { ToolMeta } from "../shelf/types.ts";
import type { Chain, Item, Login } from "../runner/types.ts";

/** One invited place a process may reach. `host` is the exact site name. */
export interface BriefSite {
  host: string;
  /** Where exploring starts. Defaults to https://<host>/. */
  url?: string;
  login?: Login;
}

export interface ShelfEntry {
  name: string;
  description: string;
  sites: string[];
  connectors: string[];
  effect: "reads" | "writes";
  lists_items: boolean;
  input: Record<string, string>;
  output: Record<string, string>;
  version: number;
}

export interface LearnBrief {
  kind: "learn";
  name: string;
  description: string;
  successCriterion: string;
  sites: BriefSite[];
  connectors: string[];
  /** Up to two pieces of example work. `data` is what a source item would carry. */
  examples: Array<Record<string, unknown>>;
}

export interface RepairBrief {
  kind: "repair";
  tool: string;
  /** The failed step's id in the chain, and the first line of its error. */
  failedStep: string;
  error: string;
  failingInput: Record<string, unknown>;
  code: string;
  meta: ToolMeta;
  examples: Array<{ input: Record<string, unknown>; result: Record<string, unknown> }>;
  pastRepairs: string[];
  sites: BriefSite[];
  connectors: string[];
  /** The chain and item the tool failed in, so the failure can be reproduced in place. */
  chain?: Chain;
  item?: Item;
}

export type MonsterBrief = LearnBrief | RepairBrief;

export interface Tokens {
  input: number;
  output: number;
  cached: number;
}

/** What the monster is asked to leave in its workspace after learning. */
export interface ProcessFile extends Chain {
  check_name: string;
  check_description: string;
}

/** The kit's view of one monster run. Written next to the workspace, never inside a tool. */
export interface KitContext {
  mode: "learn" | "repair";
  shelfDir: string;
  sites: string[];
  connectors: string[];
  logins: Record<string, Login>;
  /** The mailbox behind a mail connector, when this job is invited to one. Removed when the run ends. */
  mail?: MailSettings | null;
  repairTool?: string;
  headless: boolean;
}

export const WORKSPACE_FILES = {
  tools: "tools",
  process: "process.json",
  repair: "repair.json",
  giveUp: "give_up.json",
  kit: "kit",
  kitDir: ".kit",
} as const;
