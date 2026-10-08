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

export async function readLogins(config: Config): Promise<Record<string, HeldLogin>> {
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
