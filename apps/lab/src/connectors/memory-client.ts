import { Readable } from "node:stream";
import type {
  DownloadNotFound,
  DownloadObject,
  FetchMessageObject,
  FetchQueryObject,
  MailboxLockObject,
  MessageStructureObject,
  SearchObject,
} from "imapflow";
import type { MailClient } from "./types.ts";

/** One message in the in-memory mailbox used by tests. Dates are ISO strings so the list survives JSON. */
export interface MemoryMessage {
  uid: number;
  messageId?: string;
  subject: string;
  from: string;
  date: string;
  text: string;
  html?: string;
  seen?: boolean;
}

export interface MemoryMailClient extends MailClient {
  /** Every method called, in order, so a test can prove the client was or was not touched. */
  readonly calls: string[];
  readonly locks: Array<{ path: string; readOnly: boolean }>;
  readonly released: number;
  readonly closed: boolean;
}

/** A fake mail client with the same read-only surface as imapflow, backed by a list of messages. */
export function createMemoryClient(messages: MemoryMessage[]): MemoryMailClient {
  const byUid = new Map(messages.map((message) => [message.uid, message]));
  const calls: string[] = [];
  const locks: Array<{ path: string; readOnly: boolean }> = [];
  const state = { released: 0, closed: false };

  const matches = (message: MemoryMessage, query: SearchObject): boolean => {
    const has = (haystack: string, needle: string) =>
      haystack.toLowerCase().includes(needle.toLowerCase());
    if (query.subject !== undefined && !has(message.subject, query.subject)) return false;
    if (query.from !== undefined && !has(message.from, query.from)) return false;
    if (
      query.text !== undefined &&
      !has(`${message.subject} ${message.from} ${message.text}`, query.text)
    ) {
      return false;
    }
    if (query.since !== undefined && new Date(message.date) < new Date(query.since)) return false;
    if (query.seen !== undefined && Boolean(message.seen) !== query.seen) return false;
    if (query.header) {
      for (const [name, value] of Object.entries(query.header)) {
        if (name.toLowerCase() === "message-id" && message.messageId !== value) return false;
      }
    }
    return true;
  };

  const toFetched = (message: MemoryMessage, query: FetchQueryObject): FetchMessageObject => {
    const fetched: FetchMessageObject = { seq: message.uid, uid: message.uid };
    if (query.envelope) {
      fetched.envelope = {
        date: new Date(message.date),
        subject: message.subject,
        from: [{ address: message.from }],
        ...(message.messageId ? { messageId: message.messageId } : {}),
      };
    }
    if (query.internalDate) fetched.internalDate = new Date(message.date);
    if (query.bodyStructure) fetched.bodyStructure = structureOf(message);
    return fetched;
  };

  return {
    calls,
    locks,
    get released() {
      return state.released;
    },
    get closed() {
      return state.closed;
    },
    async connect() {
      calls.push("connect");
    },
    async getMailboxLock(path, options): Promise<MailboxLockObject> {
      calls.push("getMailboxLock");
      locks.push({ path, readOnly: Boolean(options?.readOnly) });
      return {
        path,
        release: () => {
          state.released += 1;
        },
      };
    },
    async search(query) {
      calls.push("search");
      return messages
        .filter((message) => matches(message, query))
        .map((message) => message.uid)
        .sort((a, b) => a - b);
    },
    async *fetch(range, query) {
      calls.push("fetch");
      for (const uid of [...range].sort((a, b) => a - b)) {
        const message = byUid.get(uid);
        if (message) yield toFetched(message, query);
      }
    },
    async fetchOne(uid, query) {
      calls.push("fetchOne");
      const message = byUid.get(uid);
      return message ? toFetched(message, query) : false;
    },
    async download(uid, part): Promise<DownloadObject | DownloadNotFound> {
      calls.push("download");
      const message = byUid.get(uid);
      if (!message) return {};
      const body = part === "2" && message.html !== undefined ? message.html : message.text;
      return {
        meta: { expectedSize: Buffer.byteLength(body) },
        content: Readable.from([Buffer.from(body, "utf8")]),
      };
    },
    async logout() {
      calls.push("logout");
      state.closed = true;
    },
    close() {
      calls.push("close");
      state.closed = true;
    },
  };
}

function structureOf(message: MemoryMessage): MessageStructureObject {
  if (message.html === undefined) return { type: "text/plain" };
  return {
    type: "multipart/alternative",
    childNodes: [
      { part: "1", type: "text/plain" },
      { part: "2", type: "text/html" },
    ],
  };
}
