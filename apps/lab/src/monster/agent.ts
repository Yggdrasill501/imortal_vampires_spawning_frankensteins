import { execFile, spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Tokens } from "./types.ts";

/**
 * The only module that knows which coding agent is the monster's brain.
 * Brief in; a stream of plain events and a workspace of files out. To use
 * another agent, replace this file and keep `runAgent` and `AgentEvent`.
 */

export type AgentEvent =
  | { type: "text"; text: string }
  | {
      type: "shell";
      phase: "started" | "completed";
      command: string;
      exitCode?: number;
      output?: string;
    }
  | { type: "file"; phase: "started" | "completed"; path: string }
  | {
      type: "browser";
      phase: "started" | "completed";
      action: string;
      args: Record<string, unknown>;
      failed?: boolean;
    }
  | { type: "tokens"; tokens: Tokens };

export interface AgentRequest {
  brief: string;
  workspace: string;
  model: string;
  /** The environment the agent starts with. Build it with `agentEnvironment`. */
  env: NodeJS.ProcessEnv;
  /** Origins the agent's browser is started with, for example https://host. */
  origins: string[];
  headless: boolean;
  timeoutMs: number;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void | Promise<void>;
  /** Applied to every raw line before it is kept on disk. */
  redact?: (text: string) => string;
}

export interface AgentResult {
  ok: boolean;
  error: string | null;
  finalText: string;
  tokens: Tokens;
  durationMs: number;
  /** The redacted raw stream, kept for inspection. */
  streamLog: string;
}

const BINARY = "cursor-agent";

export async function runAgent(request: AgentRequest): Promise<AgentResult> {
  const started = Date.now();
  const redact = request.redact ?? ((text: string) => text);
  await writeBrowserConfig(request);
  const logDir = path.join(request.workspace, ".kit");
  await mkdir(logDir, { recursive: true });
  const streamLog = path.join(logDir, "stream.jsonl");
  const log = createWriteStream(streamLog, { flags: "a" });

  const tokens: Tokens = { input: 0, output: 0, cached: 0 };
  let finalText = "";
  let resultError: string | null = null;
  let sawResult = false;
  let stderr = "";
  let stopReason: string | null = null;
  // Events are handled in order, one at a time, so hooks see them as they happened.
  let queue: Promise<void> = Promise.resolve();

  const child = spawn(
    BINARY,
    [
      "-p",
      "--output-format",
      "stream-json",
      "--force",
      "--approve-mcps",
      "--trust",
      "--model",
      request.model,
      "--workspace",
      request.workspace,
      request.brief,
    ],
    {
      cwd: request.workspace,
      env: request.env,
      stdio: ["ignore", "pipe", "pipe"],
      // Its own process group, so the browser and tool server die with it.
      detached: true,
    },
  );

  const stop = (reason: string) => {
    if (stopReason) return;
    stopReason = reason;
    killGroup(child.pid, "SIGTERM");
    setTimeout(() => killGroup(child.pid, "SIGKILL"), 3000).unref();
  };
  const timer = setTimeout(
    () => stop(`The session timed out after ${Math.round(request.timeoutMs / 60_000)} minutes.`),
    request.timeoutMs,
  );
  const onAbort = () => stop("The session was stopped.");
  if (request.signal?.aborted) onAbort();
  request.signal?.addEventListener("abort", onAbort, { once: true });

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    log.write(`${redact(line)}\n`);
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      return;
    }
    if (!isRecord(raw)) return;
    if (raw.type === "result") {
      sawResult = true;
      if (typeof raw.result === "string") finalText = raw.result;
      if (raw.is_error === true || raw.subtype !== "success") {
        resultError = typeof raw.result === "string" && raw.result ? raw.result : "The agent reported an error.";
      }
      const usage = isRecord(raw.usage) ? raw.usage : {};
      tokens.input += num(usage.inputTokens);
      tokens.output += num(usage.outputTokens);
      tokens.cached += num(usage.cacheReadTokens);
      emit({ type: "tokens", tokens: { ...tokens } });
      return;
    }
    for (const event of translate(raw)) emit(event);
  };
  const emit = (event: AgentEvent) => {
    if (!request.onEvent) return;
    const handler = request.onEvent;
    queue = queue.then(() => handler(event)).catch(() => undefined);
  };

  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      handleLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
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
  clearTimeout(timer);
  request.signal?.removeEventListener("abort", onAbort);
  if (buffer) handleLine(buffer);
  await queue;
  await new Promise<void>((resolve) => log.end(resolve));
  // Whatever the agent left running (a browser, the tool server) ends with the session.
  killGroup(child.pid, "SIGKILL");

  let error: string | null = null;
  if (stopReason) error = stopReason;
  else if (resultError) error = firstLine(redact(resultError));
  else if (exitCode !== 0) error = firstLine(redact(stderr)) || "The agent stopped unexpectedly.";
  else if (!sawResult) error = "The agent ended without a result.";

  return {
    ok: error === null,
    error,
    finalText: redact(finalText),
    tokens,
    durationMs: Date.now() - started,
    streamLog,
  };
}

/** The agent finds its browser through this file in its workspace. */
async function writeBrowserConfig(request: AgentRequest): Promise<void> {
  const args = ["-y", "@playwright/mcp@latest", "--isolated"];
  if (request.origins.length > 0) args.push("--allowed-origins", request.origins.join(";"));
  if (request.headless) args.push("--headless");
  const nodeBin = path.dirname(process.execPath);
  const config = {
    mcpServers: {
      playwright: {
        command: path.join(nodeBin, "npx"),
        args,
        // The agent's own shell may default to an older Node.
        env: { PATH: `${nodeBin}:${request.env.PATH ?? ""}` },
      },
    },
  };
  const folder = path.join(request.workspace, ".cursor");
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "mcp.json"), `${JSON.stringify(config, null, 2)}\n`);
  // The agent reads this file from the root of the enclosing repository, not
  // from --workspace. Workspaces live inside the product's repository, so each
  // one is made its own root; without this the browser silently never loads.
  if (!existsSync(path.join(request.workspace, ".git"))) {
    await new Promise<void>((resolve, reject) => {
      execFile("git", ["init", "-q"], { cwd: request.workspace, env: request.env }, (error) =>
        error ? reject(new Error("The workspace could not be prepared for the agent.")) : resolve(),
      );
    });
  }
}

function translate(raw: Record<string, unknown>): AgentEvent[] {
  if (raw.type === "assistant") {
    const message = isRecord(raw.message) ? raw.message : {};
    const content = Array.isArray(message.content) ? message.content : [];
    return content.flatMap((part) =>
      isRecord(part) && part.type === "text" && typeof part.text === "string" && part.text.trim()
        ? [{ type: "text" as const, text: part.text }]
        : [],
    );
  }
  if (raw.type !== "tool_call" || !isRecord(raw.tool_call)) return [];
  const phase = raw.subtype === "completed" ? "completed" : "started";
  const call = raw.tool_call;

  if (isRecord(call.shellToolCall)) {
    const args = isRecord(call.shellToolCall.args) ? call.shellToolCall.args : {};
    const result = isRecord(call.shellToolCall.result) ? call.shellToolCall.result : {};
    const done = isRecord(result.success) ? result.success : isRecord(result.failure) ? result.failure : {};
    return [
      {
        type: "shell",
        phase,
        command: str(args.command),
        ...(phase === "completed"
          ? {
              exitCode: typeof done.exitCode === "number" ? done.exitCode : undefined,
              output: str(done.stdout) || str(done.interleavedOutput),
            }
          : {}),
      },
    ];
  }
  for (const key of ["editToolCall", "writeToolCall", "deleteToolCall"]) {
    const entry = call[key];
    if (!isRecord(entry)) continue;
    const args = isRecord(entry.args) ? entry.args : {};
    if (typeof args.path === "string") return [{ type: "file", phase, path: args.path }];
  }
  if (isRecord(call.mcpToolCall)) {
    const args = isRecord(call.mcpToolCall.args) ? call.mcpToolCall.args : {};
    const name = str(args.toolName) || str(args.name);
    const result = isRecord(call.mcpToolCall.result) ? call.mcpToolCall.result : {};
    const success = isRecord(result.success) ? result.success : null;
    return [
      {
        type: "browser",
        phase,
        action: name.replace(/^.*browser_/, ""),
        args: isRecord(args.args) ? args.args : {},
        ...(phase === "completed"
          ? { failed: success === null || success.isError === true }
          : {}),
      },
    ];
  }
  return [];
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

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "";
}
