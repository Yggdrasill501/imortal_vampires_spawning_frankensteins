import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Login } from "../runner/types.ts";
import { createDescriber, makeRedactor, type Action } from "./actions.ts";
import { runAgent } from "./agent.ts";
import { buildLearnBrief, buildRepairBrief } from "./briefs.ts";
import { inspectLearn, inspectRepair, type LearnFindings, type RepairFindings } from "./inspect.ts";
import { prepareKit, sealKit } from "./kit.ts";
import { listShelf } from "./shelf.ts";
import {
  WORKSPACE_FILES,
  type BriefSite,
  type LearnBrief,
  type RepairBrief,
  type Tokens,
} from "./types.ts";
import { draftFolder } from "./workspace.ts";

export interface MonsterOptions {
  workspace: string;
  shelfDir: string;
  model: string;
  /** From `agentEnvironment(config)`. */
  env: NodeJS.ProcessEnv;
  headless?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  onAction?: (action: Action) => void | Promise<void>;
  onTokens?: (tokens: Tokens) => void | Promise<void>;
}

interface Session {
  /** False when the session itself failed: an error, a timeout, a stop. */
  agentOk: boolean;
  /** One sentence when the monster run failed; null otherwise. */
  error: string | null;
  tokens: Tokens;
  durationMs: number;
  workspace: string;
}

export interface LearnOutcome extends Session {
  ok: boolean;
  findings: LearnFindings;
}

export interface RepairOutcome extends Session {
  findings: RepairFindings;
}

const DEFAULT_TIMEOUT_MS = 1_200_000;

/** One monster learns one process. Installs nothing: the caller does, from `findings`. */
export async function learn(brief: LearnBrief, options: MonsterOptions): Promise<LearnOutcome> {
  const access = accessOf(brief.sites, brief.connectors, options);
  await mkdir(options.workspace, { recursive: true });
  await prepareKit(options.workspace, {
    mode: "learn",
    shelfDir: options.shelfDir,
    sites: access.sites,
    connectors: access.connectors,
    logins: access.logins,
    headless: access.headless,
  });
  const text = buildLearnBrief({
    brief,
    shelf: await listShelf(options.shelfDir),
    workspace: options.workspace,
    minutes: minutesFor(options),
  });
  const session = await runSession(text, brief.sites, access, options);
  const findings = await inspectLearn(options.workspace, access);
  const ok = session.agentOk && findings.ok;
  return {
    ...session,
    ok,
    error: ok ? null : (session.error ?? findings.problems[0] ?? "The agent did not finish."),
    findings,
  };
}

/** One monster repairs one tool. Submits nothing: the caller does, from `findings`. */
export async function repair(brief: RepairBrief, options: MonsterOptions): Promise<RepairOutcome> {
  const access = accessOf(brief.sites, brief.connectors, options);
  const workspace = options.workspace;
  await mkdir(workspace, { recursive: true });
  await prepareKit(workspace, {
    mode: "repair",
    shelfDir: options.shelfDir,
    sites: access.sites,
    connectors: access.connectors,
    logins: access.logins,
    repairTool: brief.tool,
    headless: access.headless,
  });
  const draft = draftFolder(workspace, brief.tool);
  await mkdir(draft, { recursive: true });
  await writeFile(path.join(draft, "meta.json"), `${JSON.stringify(brief.meta, null, 2)}\n`);
  await writeFile(path.join(draft, "tool.mjs"), brief.code);
  const kitDir = path.join(workspace, WORKSPACE_FILES.kitDir);
  await writeFile(path.join(kitDir, "failing-input.json"), `${JSON.stringify(brief.failingInput, null, 2)}\n`);
  if (brief.chain && brief.item) {
    await writeFile(path.join(kitDir, "item.json"), `${JSON.stringify(brief.item, null, 2)}\n`);
    await writeFile(
      path.join(workspace, WORKSPACE_FILES.process),
      `${JSON.stringify(
        {
          ...brief.chain,
          check_name: "Proof",
          check_description: "The proof of the chain this tool failed in.",
        },
        null,
        2,
      )}\n`,
    );
  }

  const text = buildRepairBrief({ brief, workspace, minutes: minutesFor(options) });
  const session = await runSession(text, brief.sites, access, options);
  let findings = await inspectRepair(workspace, brief, access);
  if (!session.agentOk && findings.outcome !== "failed") {
    findings = { outcome: "failed", problems: [session.error ?? "The agent did not finish."] };
  }
  return {
    ...session,
    error:
      findings.outcome === "failed"
        ? (session.error ?? findings.problems[0] ?? "The agent did not finish.")
        : null,
    findings,
  };
}

async function runSession(
  text: string,
  sites: BriefSite[],
  access: ReturnType<typeof accessOf>,
  options: MonsterOptions,
): Promise<Session> {
  const redact = makeRedactor(Object.values(access.logins));
  const describe = createDescriber(options.workspace);
  let tokens: Tokens = { input: 0, output: 0, cached: 0 };
  try {
    const result = await runAgent({
      brief: text,
      workspace: options.workspace,
      model: options.model,
      env: options.env,
      origins: sites.map((site) => (site.url ? new URL(site.url).origin : `https://${site.host}`)),
      headless: access.headless,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      signal: options.signal,
      redact,
      onEvent: async (event) => {
        if (event.type === "tokens") {
          tokens = event.tokens;
          await options.onTokens?.(event.tokens);
          return;
        }
        const action = describe(event);
        if (action) await options.onAction?.({ ...action, text: redact(action.text) });
      },
    });
    return {
      agentOk: result.ok,
      error: result.error,
      tokens: result.tokens,
      durationMs: result.durationMs,
      workspace: options.workspace,
    };
  } catch (error) {
    return {
      agentOk: false,
      error: redact(error instanceof Error ? error.message : String(error)).split("\n", 1)[0] ?? null,
      tokens,
      durationMs: 0,
      workspace: options.workspace,
    };
  } finally {
    // The workspace is kept for inspection; the logins are not.
    await sealKit(options.workspace);
  }
}

function accessOf(sites: BriefSite[], connectors: string[], options: MonsterOptions) {
  const logins: Record<string, Login> = {};
  for (const site of sites) if (site.login) logins[site.host] = site.login;
  return {
    shelfDir: options.shelfDir,
    sites: sites.map((site) => site.host),
    connectors,
    logins,
    passwords: Object.values(logins).map((login) => login.password),
    headless: options.headless ?? process.env.LAB_HEADLESS === "1",
  };
}

function minutesFor(options: MonsterOptions): number {
  const total = Math.floor((options.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 60_000);
  return Math.max(3, total - 4);
}
