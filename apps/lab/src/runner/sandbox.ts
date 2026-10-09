import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

/**
 * Generated code never runs as an ordinary process. On macOS the worker that
 * executes a tool is started inside the system sandbox, with a profile that
 * denies it the places credentials live and every write outside scratch space.
 * The tool still gets what the lab hands it: its input, the login for the
 * sites it declared, its connectors, and a browser.
 */

const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

export type SandboxKind = "macos-seatbelt" | "none";

export interface SandboxPlaces {
  /** The repository: its .env files are denied. */
  repoRoot: string;
  /** The lab's own state: held logins and monster workspaces. */
  dataDir: string;
}

export function sandboxKind(): SandboxKind {
  if (process.env.LAB_SANDBOX === "0") return "none";
  return process.platform === "darwin" && existsSync(SANDBOX_EXEC) ? "macos-seatbelt" : "none";
}

/** Wraps a command so it starts inside the sandbox. Unchanged where no sandbox exists. */
export function sandboxed(
  command: string,
  args: string[],
  places: SandboxPlaces,
): { command: string; args: string[]; kind: SandboxKind } {
  const kind = sandboxKind();
  if (kind === "none") return { command, args, kind };
  return { command: SANDBOX_EXEC, args: ["-p", profile(places), command, ...args], kind };
}

export function profile(places: SandboxPlaces): string {
  const home = homedir();
  const repo = path.resolve(places.repoRoot);
  const data = path.resolve(places.dataDir);
  const secretFolders = [
    ".ssh",
    ".aws",
    ".azure",
    ".gnupg",
    ".config",
    ".cursor",
    ".claude",
    ".docker",
    ".kube",
    "Library/Keychains",
    "Library/Cookies",
    "Library/Application Support/Google/Chrome",
    "Library/Application Support/Cursor",
  ].map((name) => `(subpath ${quote(path.join(home, name))})`);
  const secretFiles = [".zshrc", ".zshenv", ".zprofile", ".zsh_history", ".bash_history", ".bashrc", ".netrc", ".npmrc", ".gitconfig", ".git-credentials"].map(
    (name) => `(literal ${quote(path.join(home, name))})`,
  );
  const scratch = [...new Set([tmpdir(), "/private/tmp", "/tmp", "/private/var/folders", "/var/folders"])].map(
    (folder) => `(subpath ${quote(folder)})`,
  );
  return [
    "(version 1)",
    "(allow default)",
    // The keys of the machine and of this project.
    `(deny file-read* ${secretFolders.join(" ")} ${secretFiles.join(" ")})`,
    `(deny file-read* (regex ${regex(`^${escape(repo)}/\\.env`)}) (regex ${regex(`^${escape(repo)}/.*/\\.env`)}))`,
    // The logins the lab holds, and the copy a monster's kit keeps while it works.
    `(deny file-read* (literal ${quote(path.join(data, "logins.json"))}) (regex ${regex(`^${escape(data)}/.*/\\.kit/context\\.json$`)}))`,
    // Nothing is written anywhere but scratch space.
    `(deny file-write* (subpath ${quote(home)}) (subpath ${quote(repo)}))`,
    `(allow file-write* ${scratch.join(" ")} (subpath ${quote(path.join(home, "Library/Caches/ms-playwright"))}))`,
  ].join("\n");
}

function quote(value: string): string {
  return `"${value.replace(/(["\\])/g, "\\$1")}"`;
}

function regex(pattern: string): string {
  return `#"${pattern.replace(/"/g, '\\"')}"`;
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
