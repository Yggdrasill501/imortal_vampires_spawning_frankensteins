import type { SiteKind } from "@repo/contract";

const CONNECTOR = /^[a-z][a-z0-9_-]{0,63}$/;
const HOST =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}$/i;

/** Host name or connector name, lower case, no scheme, port or path. */
export function siteIdentity(raw: string, kind: SiteKind): string {
  const trimmed = raw.trim().toLowerCase();
  if (kind === "connector") return trimmed;
  try {
    if (trimmed.includes("://")) return new URL(trimmed).hostname.toLowerCase();
  } catch {
    // Fall through to host stripping.
  }
  return (trimmed.split("/")[0] ?? "").split(":")[0] ?? "";
}

export function isSiteIdentity(site: string, kind: SiteKind): boolean {
  return kind === "connector" ? CONNECTOR.test(site) : HOST.test(site);
}
