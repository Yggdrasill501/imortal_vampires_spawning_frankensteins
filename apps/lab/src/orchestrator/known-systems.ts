import type { SiteKind } from "@repo/contract";
import { isSiteIdentity, siteIdentity } from "../site.ts";

export const KNOWN_SYSTEMS_VARIABLE = "LAB_KNOWN_SYSTEMS";

/** One system the orchestrator may propose. The only source of site names. */
export interface KnownSystem {
  name: string;
  /** Host name for a website, connector name for a connector; lower case. */
  site: string;
  kind: SiteKind;
  loginNeeded: boolean;
}

/** Reads the JSON array in `LAB_KNOWN_SYSTEMS`. One plain sentence when it cannot be used. */
export function parseKnownSystems(raw: string | undefined): KnownSystem[] | { error: string } {
  if (raw === undefined || raw.trim() === "") {
    return { error: `${KNOWN_SYSTEMS_VARIABLE} is not set, so the orchestrator has no systems it may propose.` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: `${KNOWN_SYSTEMS_VARIABLE} is not valid JSON.` };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { error: `${KNOWN_SYSTEMS_VARIABLE} must be a JSON array with at least one system.` };
  }
  const systems: KnownSystem[] = [];
  for (const [index, entry] of parsed.entries()) {
    const system = readSystem(entry);
    if (!system) {
      return {
        error: `${KNOWN_SYSTEMS_VARIABLE} entry ${index + 1} needs a name, a site, a kind of website or connector, and loginNeeded true or false.`,
      };
    }
    if (systems.some((known) => known.site === system.site && known.kind === system.kind)) {
      return { error: `${KNOWN_SYSTEMS_VARIABLE} lists the site ${system.site} more than once.` };
    }
    systems.push(system);
  }
  return systems;
}

function readSystem(entry: unknown): KnownSystem | null {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return null;
  const record = entry as Record<string, unknown>;
  const { name, site, kind, loginNeeded } = record;
  if (typeof name !== "string" || !name.trim()) return null;
  if (kind !== "website" && kind !== "connector") return null;
  if (typeof site !== "string") return null;
  const identity = siteIdentity(site, kind);
  if (!identity || !isSiteIdentity(identity, kind)) return null;
  if (typeof loginNeeded !== "boolean") return null;
  return { name: name.trim(), site: identity, kind, loginNeeded };
}

/** Finds a known system by its site, or by its name when the model used that instead. */
export function findKnownSystem(raw: string, knownSystems: readonly KnownSystem[]): KnownSystem | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  for (const system of knownSystems) {
    if (siteIdentity(trimmed, system.kind) === system.site) return system;
  }
  const lowered = trimmed.toLowerCase();
  return knownSystems.find((system) => system.name.toLowerCase() === lowered) ?? null;
}
