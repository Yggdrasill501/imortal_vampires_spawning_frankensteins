import type { MailSettings } from "./types.ts";

export const DEFAULT_MAIL_HOST = "imap.gmail.com";
export const DEFAULT_MAIL_PORT = 993;

/** Returns null when no mailbox is configured; the connector then refuses with one sentence. */
export function readMailSettings(env: NodeJS.ProcessEnv): MailSettings | null {
  const user = env.LAB_MAIL_USER?.trim() ?? "";
  const pass = env.LAB_MAIL_PASS ?? "";
  if (!user || !pass) return null;
  const host = env.LAB_MAIL_HOST?.trim() || DEFAULT_MAIL_HOST;
  const rawPort = env.LAB_MAIL_PORT?.trim() ?? "";
  const port = rawPort === "" ? DEFAULT_MAIL_PORT : Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("LAB_MAIL_PORT is not valid.");
  }
  // Only a mail server on this machine may be reached without encryption.
  const secure = env.LAB_MAIL_SECURE?.trim() !== "0";
  if (!secure && !["localhost", "127.0.0.1", "::1"].includes(host)) {
    throw new Error("LAB_MAIL_SECURE=0 is only allowed for a mail server on this machine.");
  }
  return { user, pass, host, port, secure };
}

/** Strips the mailbox user and password from text before it reaches a tool, a log or a record. */
export function redactMail(text: string, settings: MailSettings | null): string {
  if (!settings) return text;
  let safe = text;
  if (settings.pass) safe = safe.split(settings.pass).join("[redacted]");
  if (settings.user) safe = safe.split(settings.user).join("[redacted]");
  return safe;
}
