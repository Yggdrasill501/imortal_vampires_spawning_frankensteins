import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Config } from "../config.ts";

export interface HeldLogin {
  name: string;
  password: string;
}

export function loginsPath(config: Config): string {
  return path.join(config.dataDir, "logins.json");
}

const ENV_PREFIX = /^[A-Z][A-Z0-9_]*$/;

/**
 * Logins the user keeps in the environment. A known system may carry
 * "loginFrom": "PREFIX"; its login is then PREFIX_USERNAME and PREFIX_PASSWORD.
 * Like a typed login, it is only ever handed out for a site that is invited.
 */
export function environmentLogins(env: NodeJS.ProcessEnv = process.env): Record<string, HeldLogin> {
  let systems: unknown;
  try {
    systems = JSON.parse(env.LAB_KNOWN_SYSTEMS ?? "");
  } catch {
    return {};
  }
  if (!Array.isArray(systems)) return {};
  const out: Record<string, HeldLogin> = {};
  for (const system of systems) {
    if (!system || typeof system !== "object") continue;
    const { site, loginFrom } = system as { site?: unknown; loginFrom?: unknown };
    if (typeof site !== "string" || typeof loginFrom !== "string" || !ENV_PREFIX.test(loginFrom)) continue;
    const name = env[`${loginFrom}_USERNAME`];
    const password = env[`${loginFrom}_PASSWORD`];
    if (name && password) out[site.trim().toLowerCase()] = { name, password };
  }
  return out;
}

/** The logins the user typed, over the ones kept in the environment. */
export async function readLogins(config: Config): Promise<Record<string, HeldLogin>> {
  return { ...environmentLogins(), ...(await readTypedLogins(config)) };
}

async function readTypedLogins(config: Config): Promise<Record<string, HeldLogin>> {
  try {
    const raw = JSON.parse(await readFile(loginsPath(config), "utf8")) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, HeldLogin> = {};
    for (const [site, value] of Object.entries(raw)) {
      if (
        value &&
        typeof value === "object" &&
        typeof (value as HeldLogin).name === "string" &&
        typeof (value as HeldLogin).password === "string"
      ) {
        out[site] = { name: (value as HeldLogin).name, password: (value as HeldLogin).password };
      }
    }
    return out;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export async function writeLogins(
  config: Config,
  logins: Record<string, HeldLogin>,
): Promise<void> {
  await mkdir(config.dataDir, { recursive: true });
  const target = loginsPath(config);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(logins, null, 2)}\n`, { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, target);
}

export function loginHeld(logins: Record<string, HeldLogin>, site: string): boolean {
  const key = Object.keys(logins).find((name) => name.toLowerCase() === site.toLowerCase());
  return Boolean(key && logins[key]?.name && logins[key]?.password);
}

export function redactSecrets(text: string, logins: Record<string, HeldLogin>): string {
  let safe = text;
  for (const login of Object.values(logins)) {
    if (login.password) safe = safe.split(login.password).join("the password");
    if (login.name) safe = safe.split(login.name).join("the name");
  }
  return safe;
}
