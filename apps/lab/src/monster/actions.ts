import type { ActionKind } from "@repo/contract";
import path from "node:path";
import type { Login } from "../runner/types.ts";
import type { AgentEvent } from "./agent.ts";
import { WORKSPACE_FILES } from "./types.ts";

export interface Action {
  kind: ActionKind;
  text: string;
  toolName?: string;
}

/** Replaces every held username and password, in plain and JSON-escaped form. */
export function makeRedactor(logins: Iterable<Login>): (text: string) => string {
  const swaps: Array<[string, string]> = [];
  for (const login of logins) {
    for (const [secret, label] of [
      [login.password, "[password]"],
      [login.username, "[username]"],
    ] as const) {
      if (!secret) continue;
      swaps.push([secret, label]);
      const escaped = JSON.stringify(secret).slice(1, -1);
      if (escaped !== secret) swaps.push([escaped, label]);
    }
  }
  // Longest first, so one secret inside another cannot leave a remainder.
  swaps.sort((a, b) => b[0].length - a[0].length);
  return (text) => swaps.reduce((safe, [secret, label]) => safe.split(secret).join(label), text);
}

const KIT_CALL = /(?:^|[\s;&|(])(?:\.\/|\S*\/)?kit\s+(shelf|search|test|chain)\b([^\n;&|]*)/;

/**
 * Turns the agent's stream into the live action list: one plain sentence per
 * step. What was typed is never included, only where it was typed.
 */
export function createDescriber(workspace: string): (event: AgentEvent) => Action | null {
  const written = new Set<string>();

  return (event) => {
    if (event.type === "browser" && event.phase === "started") return browserAction(event);
    if (event.type === "file" && event.phase === "completed") {
      const relative = path.relative(workspace, path.resolve(workspace, event.path));
      const parts = relative.split(path.sep);
      if (parts[0] === WORKSPACE_FILES.tools && parts[1] && parts[2] === "tool.mjs") {
        const first = !written.has(parts[1]);
        written.add(parts[1]);
        return {
          kind: "create_tool",
          text: first ? `Wrote the tool ${parts[1]}.` : `Changed the tool ${parts[1]}.`,
          toolName: parts[1],
        };
      }
      if (relative === WORKSPACE_FILES.process) return { kind: "save_process", text: "Wrote the chain." };
      return null;
    }
    if (event.type !== "shell") return null;
    const call = KIT_CALL.exec(event.command);
    if (!call) return null;
    const [, command, rest = ""] = call;
    if (command === "shelf" && event.phase === "started") {
      return { kind: "search_shelf", text: "Looked at the shelf." };
    }
    if (command === "search" && event.phase === "started") {
      const words = rest.replace(/["']/g, "").trim();
      return { kind: "search_shelf", text: `Searched the shelf for ${words || "tools"}.` };
    }
    if (event.phase !== "completed") return null;
    const outcome = readOutcome(event.output ?? "");
    if (command === "test") {
      const name = rest.trim().split(/\s+/)[0] || "a tool";
      return { kind: "test_tool", text: `Tested ${name}: ${outcome}`, toolName: name };
    }
    if (command === "chain") {
      const until = /--until\s+(\S+)/.exec(rest)?.[1];
      return {
        kind: "test_tool",
        text: `Ran the chain${until ? ` up to ${until}` : ""}: ${outcome}`,
      };
    }
    return null;
  };
}

function browserAction(event: Extract<AgentEvent, { type: "browser" }>): Action | null {
  const named = text(event.args.element) || text(event.args.target) || text(event.args.ref);
  const on = named ? ` ${clip(named)}` : " something on the page";
  switch (event.action) {
    case "navigate":
      return { kind: "open_page", text: `Opened ${clip(text(event.args.url) || "a page")}.` };
    case "navigate_back":
      return { kind: "open_page", text: "Went back a page." };
    case "click":
      return { kind: "click", text: `Clicked${on}.` };
    case "select_option":
      return { kind: "click", text: `Chose an option in${on}.` };
    case "hover":
      return null;
    case "type":
      return { kind: "type", text: `Typed into${on}.` };
    case "fill_form": {
      const fields = Array.isArray(event.args.fields) ? event.args.fields.length : 0;
      return { kind: "type", text: `Filled in ${fields || "some"} field${fields === 1 ? "" : "s"}.` };
    }
    case "press_key":
      return { kind: "type", text: `Pressed ${clip(text(event.args.key) || "a key")}.` };
    case "snapshot":
    case "take_screenshot":
      return { kind: "read", text: "Read the page." };
    default:
      return null;
  }
}

function readOutcome(output: string): string {
  let status = /"status":\s*"(\w+)"/.exec(output)?.[1];
  let error = /"error":\s*"((?:[^"\\]|\\.)*)"/.exec(output)?.[1];
  try {
    const parsed = JSON.parse(output) as { status?: string; error?: string | null };
    status = parsed.status ?? status;
    error = parsed.error ?? undefined;
  } catch {
    // Mixed output; the patterns above are the fallback.
  }
  if (status === "passed") return "it passed.";
  if (!status) return "no result came back.";
  const why = error ? clip(error.replace(/\.$/, ""), 160) : "";
  return why ? `it ${status}. ${why}.` : `it ${status}.`;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clip(value: string, max = 80): string {
  const single = value.replace(/\s+/g, " ");
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}
