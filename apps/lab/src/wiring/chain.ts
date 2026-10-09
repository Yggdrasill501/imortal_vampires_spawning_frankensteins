import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Fact } from "@repo/contract";
import type { Lab } from "../app.ts";
import type { Config } from "../config.ts";
import { parseProcess } from "../monster/workspace.ts";
import type { BriefSite, ProcessFile } from "../monster/types.ts";
import type { Item, Login, RunScope } from "../runner/types.ts";
import { readLogins } from "../store/logins.ts";

/**
 * A saved process's chain: its steps with their inputs, and its proof. The
 * database holds which tools a process uses; the chain itself is kept here,
 * exactly as the monster wrote it and the lab checked it.
 */
export function chainPath(config: Config, processId: string): string {
  return path.join(config.dataDir, "chains", `${processId}.json`);
}

export async function saveChainFile(config: Config, processId: string, file: ProcessFile): Promise<void> {
  const target = chainPath(config, processId);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(file, null, 2)}\n`);
}

export async function readChainFile(config: Config, processId: string): Promise<ProcessFile | null> {
  try {
    return parseProcess(JSON.parse(await readFile(chainPath(config, processId), "utf8")));
  } catch {
    return null;
  }
}

export interface Access {
  sites: string[];
  connectors: string[];
  logins: Record<string, Login>;
}

/** What one process may reach: its own sites and connectors, and only those that are invited. */
export async function accessOf(lab: Lab, processId: string): Promise<{ invited: Access; process: Access }> {
  const invitedRows = await lab.db.selectFrom("invitation_site").select(["site", "kind"]).execute();
  const processRows = await lab.db
    .selectFrom("process_site")
    .select(["site", "kind"])
    .where("process_id", "=", processId)
    .execute();
  const held = await readLogins(lab.config);
  const split = (rows: Array<{ site: string; kind: string }>): Access => {
    const sites = rows.filter((row) => row.kind === "website").map((row) => row.site);
    const logins: Record<string, Login> = {};
    for (const site of sites) {
      const key = Object.keys(held).find((name) => name.toLowerCase() === site.toLowerCase());
      if (key && held[key]) logins[site] = { username: held[key].name, password: held[key].password };
    }
    return {
      sites,
      connectors: rows.filter((row) => row.kind === "connector").map((row) => row.site),
      logins,
    };
  };
  const invited = split(invitedRows);
  const invitedNames = new Set(invitedRows.map((row) => row.site));
  // A site the process names but the user never invited is not handed on.
  const process = split(processRows.filter((row) => invitedNames.has(row.site)));
  return { invited, process };
}

export async function scopeOf(lab: Lab, processId: string): Promise<RunScope> {
  const access = await accessOf(lab, processId);
  return {
    invitation: { sites: access.invited.sites, connectors: access.invited.connectors },
    process: { sites: access.process.sites, connectors: access.process.connectors },
    logins: access.process.logins,
  };
}

export async function briefSitesOf(lab: Lab, processId: string): Promise<{ sites: BriefSite[]; connectors: string[] }> {
  const { process } = await accessOf(lab, processId);
  return {
    sites: process.sites.map((host) => ({
      host,
      ...(process.logins[host] ? { login: process.logins[host] } : {}),
    })),
    connectors: process.connectors,
  };
}

/** An item's data as the rows the screens show. Values that are not text are kept as JSON. */
export function factsOf(data: Record<string, unknown> | null | undefined): Fact[] {
  return Object.entries(data ?? {}).map(([label, value]) => ({
    label,
    value: typeof value === "string" ? value : JSON.stringify(value),
  }));
}

export function dataOf(facts: readonly Fact[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const fact of facts) {
    let value: unknown = fact.value;
    if (/^(\{|\[|-?\d|true$|false$|null$)/.test(fact.value)) {
      try {
        value = JSON.parse(fact.value);
      } catch {
        // Plain text that only looked like JSON.
      }
    }
    data[fact.label] = value;
  }
  return data;
}

export function itemOf(listed: { id: string; label: string; fields: readonly Fact[] }): Item {
  return { id: listed.id, label: listed.label, data: dataOf(listed.fields) };
}
