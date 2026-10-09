import type { Readable } from "node:stream";
import type {
  FetchMessageObject,
  MessageAddressObject,
  MessageStructureObject,
  SearchObject,
} from "imapflow";
import { firstLine } from "../shelf/validator.ts";
import { createImapClient } from "./imap-client.ts";
import { redactMail } from "./settings.ts";
import type { ConnectorHandle, MailClient, MailClientFactory, MailSettings } from "./types.ts";

/**
 * The only actions a tool may ask of the mailbox. Searching and reading never
 * change a message; nothing here can send, delete, move or flag one.
 */
export const GMAIL_ACTIONS = ["search", "read"] as const;

const MAILBOX = "INBOX";
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const UID_ID = /^uid:([1-9][0-9]*)$/;
const MESSAGE_ID = /^<[^<>\s]+>$/;

interface Session {
  client: MailClient;
  release(): void;
}

/**
 * A read-only mailbox. The mailbox is opened once per step, read-only, on the
 * first call, and closed by the runner when the step ends. The client is
 * injectable so tests run against an in-memory mailbox.
 */
export function createGmailConnector(
  settings: MailSettings | null,
  clientFactory: MailClientFactory = createImapClient,
): ConnectorHandle {
  if (!settings) {
    throw new Error("The gmail connector needs LAB_MAIL_USER and LAB_MAIL_PASS to be set.");
  }
  let session: Promise<Session> | null = null;

  const open = (): Promise<Session> => {
    if (!session) {
      session = (async () => {
        const client = clientFactory(settings);
        try {
          await client.connect();
          const lock = await client.getMailboxLock(MAILBOX, { readOnly: true });
          return { client, release: () => lock.release() };
        } catch (error) {
          client.close();
          throw error;
        }
      })();
    }
    return session;
  };

  return {
    async call(action, args) {
      if (!GMAIL_ACTIONS.includes(action as (typeof GMAIL_ACTIONS)[number])) {
        throw new Error(
          `The gmail connector does not allow the action "${String(action)}". It allows: ${GMAIL_ACTIONS.join(", ")}.`,
        );
      }
      const safeArgs = isRecord(args) ? args : {};
      try {
        const { client } = await open();
        return action === "search" ? await search(client, safeArgs) : await read(client, safeArgs);
      } catch (error) {
        throw new Error(redactMail(firstLine(error), settings));
      }
    },
    async close() {
      const pending = session;
      session = null;
      if (!pending) return;
      let opened: Session;
      try {
        opened = await pending;
      } catch {
        return;
      }
      try {
        opened.release();
        await opened.client.logout();
      } catch {
        opened.client.close();
      }
    },
  };
}

async function search(
  client: MailClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const query = optionalString(args, "query");
  const subject = optionalString(args, "subject");
  const from = optionalString(args, "from");
  const sinceDays = optionalPositiveInteger(args, "sinceDays");
  const unreadOnly = optionalBoolean(args, "unreadOnly");
  const limit = Math.min(optionalPositiveInteger(args, "limit") ?? DEFAULT_LIMIT, MAX_LIMIT);

  const criteria: SearchObject = {};
  if (query !== undefined) criteria.text = query;
  if (subject !== undefined) criteria.subject = subject;
  if (from !== undefined) criteria.from = from;
  if (sinceDays !== undefined) criteria.since = new Date(Date.now() - sinceDays * 86_400_000);
  if (unreadOnly) criteria.seen = false;
  if (Object.keys(criteria).length === 0) criteria.all = true;

  const found = await client.search(criteria, { uid: true });
  const uids = (Array.isArray(found) ? found : []).sort((a, b) => b - a).slice(0, limit);
  if (uids.length === 0) return { messages: [] };

  const messages: Array<Record<string, unknown> & { uid: number; time: number }> = [];
  for await (const fetched of client.fetch(
    uids,
    { uid: true, envelope: true, internalDate: true },
    { uid: true },
  )) {
    messages.push({ ...summary(fetched), uid: fetched.uid, time: timeOf(fetched) });
  }
  messages.sort((a, b) => b.time - a.time || b.uid - a.uid);
  return { messages: messages.map(({ uid: _uid, time: _time, ...message }) => message) };
}

async function read(
  client: MailClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const id = args.id;
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new Error("The read action needs a message id.");
  }
  const uid = await resolveUid(client, id.trim());
  const fetched = await client.fetchOne(
    uid,
    { uid: true, envelope: true, internalDate: true, bodyStructure: true },
    { uid: true },
  );
  if (!fetched) throw new Error(`No message has the id ${id}.`);
  const part = textPartOf(fetched.bodyStructure);
  let text = "";
  if (part) {
    const downloaded = await client.download(uid, part.part, { uid: true });
    text = downloaded.content ? await readStream(downloaded.content) : "";
    if (part.html) text = stripHtml(text);
  }
  return { ...summary(fetched), text: text.replace(/\r\n/g, "\n") };
}

async function resolveUid(client: MailClient, id: string): Promise<number> {
  const asUid = UID_ID.exec(id);
  if (asUid) return Number(asUid[1]);
  if (!MESSAGE_ID.test(id)) {
    throw new Error("The message id must be a Message-ID in angle brackets or uid:<number>.");
  }
  const found = await client.search({ header: { "message-id": id } }, { uid: true });
  const uids = Array.isArray(found) ? found : [];
  if (uids.length === 0) throw new Error(`No message has the id ${id}.`);
  return Math.max(...uids);
}

function summary(fetched: FetchMessageObject): {
  id: string;
  subject: string;
  from: string;
  date: string;
} {
  const envelope = fetched.envelope;
  const messageId = envelope?.messageId?.trim();
  return {
    id: messageId && MESSAGE_ID.test(messageId) ? messageId : `uid:${fetched.uid}`,
    subject: envelope?.subject ?? "",
    from: formatAddresses(envelope?.from),
    date: new Date(timeOf(fetched)).toISOString(),
  };
}

function timeOf(fetched: FetchMessageObject): number {
  for (const candidate of [fetched.envelope?.date, fetched.internalDate]) {
    if (candidate === undefined) continue;
    const time = new Date(candidate).getTime();
    if (Number.isFinite(time)) return time;
  }
  return 0;
}

function formatAddresses(addresses: MessageAddressObject[] | undefined): string {
  return (addresses ?? [])
    .map(({ name, address }) => {
      if (name && address) return `${name} <${address}>`;
      return address ?? name ?? "";
    })
    .filter(Boolean)
    .join(", ");
}

/** Picks the plain-text part, or the HTML part when the message has no plain text. */
function textPartOf(
  structure: MessageStructureObject | undefined,
): { part: string; html: boolean } | null {
  if (!structure) return null;
  const plain = findPart(structure, "text/plain");
  if (plain) return { part: plain, html: false };
  const html = findPart(structure, "text/html");
  if (html) return { part: html, html: true };
  return null;
}

function findPart(node: MessageStructureObject, type: string): string | null {
  if (node.type?.toLowerCase() === type) {
    // A single-part message has no part number; "text" is the whole body.
    return node.part ?? "text";
  }
  for (const child of node.childNodes ?? []) {
    const found = findPart(child, type);
    if (found) return found;
  }
  return null;
}

async function readStream(content: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of content) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk, "utf8") : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`The ${key} argument must be text.`);
  return value.trim() === "" ? undefined : value;
}

function optionalPositiveInteger(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`The ${key} argument must be a whole number of at least 1.`);
  }
  return value;
}

function optionalBoolean(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new Error(`The ${key} argument must be true or false.`);
  return value;
}
