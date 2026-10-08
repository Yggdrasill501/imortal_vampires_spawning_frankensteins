import type { InvitationSiteInput, SiteKind } from "@repo/contract";
import type { Trx } from "../app.ts";
import { invalid } from "../errors.ts";
import { isSiteIdentity, siteIdentity } from "../site.ts";
import type { HeldLogin } from "./logins.ts";

export async function listInvitationSites(trx: Trx) {
  return trx
    .selectFrom("invitation_site")
    .selectAll()
    .orderBy("granted_at")
    .orderBy("site")
    .execute();
}

export async function applyInvitation(
  trx: Trx,
  sites: InvitationSiteInput[],
  neededByUnretired: Map<string, string[]>,
  neededByAny: Map<string, { kind: SiteKind; loginNeeded: boolean }>,
  currentLogins: Record<string, HeldLogin>,
): Promise<Record<string, HeldLogin>> {
  const seen = new Set<string>();
  const incoming: Array<{ site: string; kind: SiteKind; login?: HeldLogin }> = [];

  for (const entry of sites) {
    if (!entry || typeof entry.site !== "string" || (entry.kind !== "website" && entry.kind !== "connector")) {
      throw invalid("A site is blank, appears twice, or has an unknown kind.");
    }
    const site = siteIdentity(entry.site, entry.kind);
    if (!site || !isSiteIdentity(site, entry.kind) || seen.has(site)) {
      throw invalid("A site is blank, appears twice, or has an unknown kind.");
    }
    seen.add(site);
    if (entry.login && (!entry.login.name.trim() || !entry.login.password)) {
      throw invalid("A login needs a name and a password.");
    }
    incoming.push({ site, kind: entry.kind, login: entry.login });
  }

  const current = await trx.selectFrom("invitation_site").selectAll().execute();
  const currentSet = new Set(current.map((row) => row.site));
  const incomingSet = new Set(incoming.map((item) => item.site));

  for (const item of incoming) {
    if (!currentSet.has(item.site) && !neededByAny.has(item.site)) {
      throw invalid(`${item.site} is not needed by any process.`);
    }
  }
  for (const [site, names] of neededByUnretired) {
    if (currentSet.has(site) && !incomingSet.has(site)) {
      throw invalid(`${site} is still needed by ${names.join(", ")}. Retire them first.`);
    }
  }

  const nextLogins: Record<string, HeldLogin> = {};
  for (const [site, login] of Object.entries(currentLogins)) {
    if (incomingSet.has(site)) nextLogins[site] = login;
  }

  for (const item of incoming) {
    const already = current.find((row) => row.site === item.site);
    const need = neededByAny.get(item.site);
    if (!already) {
      await trx
        .insertInto("invitation_site")
        .values({
          site: item.site,
          kind: item.kind,
          login_needed: need?.loginNeeded ?? false,
        })
        .execute();
    }
    if (item.login) nextLogins[item.site] = item.login;
  }

  for (const row of current) {
    if (!incomingSet.has(row.site)) {
      await trx.deleteFrom("invitation_site").where("site", "=", row.site).execute();
    }
  }

  return nextLogins;
}
