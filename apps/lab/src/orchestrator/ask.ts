import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * The only module that knows which model runs the orchestrator. One prompt
 * in, the model's final text out. Replace this file to use another agent.
 */

export interface AskOptions {
  model: string;
  /** The environment the agent starts with. Comes from the caller, never from here. */
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export type Ask = (prompt: string, options: AskOptions) => Promise<string>;

const BINARY = "cursor-agent";
export const STOPPED = "The reading was stopped.";

/**
 * Runs the Cursor command-line agent non-interactively in a new empty folder.
 * No `--force`: the agent may not write files or run commands.
 */
export const askCursorAgent: Ask = async (prompt, options) => {
  if (options.signal?.aborted) throw new Error(STOPPED);
  const workspace = await mkdtemp(path.join(tmpdir(), "lab-orchestrator-"));
  try {
    return await runAgent(prompt, workspace, options);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
};

async function runAgent(prompt: string, workspace: string, options: AskOptions): Promise<string> {
  const child = spawn(
    BINARY,
    ["-p", "--output-format", "json", "--trust", "--model", options.model, "--workspace", workspace, prompt],
    {
      cwd: workspace,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      // Its own process group, so anything it starts dies with it.
      detached: true,
    },
  );

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    killGroup(child.pid, "SIGTERM");
    setTimeout(() => killGroup(child.pid, "SIGKILL"), 3000).unref();
  };
  options.signal?.addEventListener("abort", stop, { once: true });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-4000);
  });

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on("error", (error) => {
      stderr += error.message;
      resolve(null);
    });
    child.on("close", (code) => resolve(code));
  });
  options.signal?.removeEventListener("abort", stop);
  killGroup(child.pid, "SIGKILL");

  if (stopped) throw new Error(STOPPED);
  const result = readResult(stdout);
  if (result.error) throw new Error(result.error);
  if (exitCode !== 0) throw new Error(firstLine(stderr) || "The agent stopped unexpectedly.");
  if (!result.text.trim()) throw new Error("The agent ended without an answer.");
  return result.text;
}

/**
 * The agent's `json` output is expected to be one result object, like the
 * last line of its `stream-json` output. Anything else is read as leniently
 * as possible: the last parseable line with a result, or the raw text.
 */
function readResult(stdout: string): { text: string; error: string | null } {
  const candidates: unknown[] = [];
  const whole = tryParse(stdout);
  if (whole !== undefined) candidates.push(whole);
  else {
    for (const line of stdout.split(/\r?\n/)) {
      const parsed = tryParse(line);
      if (parsed !== undefined) candidates.push(parsed);
    }
  }
  const results = candidates.filter(isRecord);
  const result = [...results].reverse().find((entry) => entry.type === "result") ?? results.at(-1);
  if (!result) return { text: stdout.trim(), error: null };

  const text = textOf(result);
  if (result.is_error === true || (typeof result.subtype === "string" && result.subtype !== "success")) {
    return { text, error: firstLine(text) || "The agent reported an error." };
  }
  return { text, error: null };
}

function textOf(result: Record<string, unknown>): string {
  for (const key of ["result", "text", "content", "output"]) {
    const value = result[key];
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      const parts = value.flatMap((part) =>
        isRecord(part) && typeof part.text === "string" ? [part.text] : typeof part === "string" ? [part] : [],
      );
      if (parts.length > 0) return parts.join("\n");
    }
  }
  const message = isRecord(result.message) ? result.message : null;
  if (message) return textOf(message);
  return "";
}

function tryParse(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function killGroup(pid: number | undefined, signal: NodeJS.Signals): void {
  if (!pid) return;
  try {
    process.kill(-pid, signal);
  } catch {
    // Already gone.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "";
}
