import type {
  DownloadNotFound,
  DownloadObject,
  FetchMessageObject,
  FetchQueryObject,
  MailboxLockObject,
  SearchObject,
} from "imapflow";
import type { MemoryMessage } from "./memory-client.ts";

/** What a tool receives as `connectors.<name>`: one call per action. */
export interface Connector {
  call(action: string, args: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/** The runner's side of a connector: the same call, plus closing it when the step ends. */
export interface ConnectorHandle extends Connector {
  close(): Promise<void>;
}

export interface ConnectorDefinition {
  name: string;
  actions: readonly string[];
  create(context: ConnectorContext): ConnectorHandle;
}

export interface ConnectorContext {
  mail: MailSettings | null;
  clientFactory?: MailClientFactory;
}

/** Read from LAB_MAIL_* by the service and handed to the worker with the request. */
export interface MailSettings {
  user: string;
  pass: string;
  host: string;
  port: number;
  /** Test fixture only: when present the connector reads these in memory and never connects. */
  fixture?: MemoryMessage[];
}

/**
 * The slice of the IMAP client the connector uses. It is the read-only subset
 * of imapflow's surface, so the real client is passed through unchanged and a
 * fake can stand in for it in tests. Nothing that sends, deletes, moves or
 * flags a message is part of this interface.
 */
export interface MailClient {
  connect(): Promise<void>;
  getMailboxLock(path: string, options: { readOnly: true }): Promise<MailboxLockObject>;
  search(query: SearchObject, options: { uid: true }): Promise<number[] | false | undefined>;
  fetch(
    range: number[],
    query: FetchQueryObject,
    options: { uid: true },
  ): AsyncIterable<FetchMessageObject>;
  fetchOne(
    uid: number,
    query: FetchQueryObject,
    options: { uid: true },
  ): Promise<FetchMessageObject | false | undefined>;
  download(
    uid: number,
    part: string,
    options: { uid: true },
  ): Promise<DownloadObject | DownloadNotFound>;
  logout(): Promise<void>;
  close(): void;
}

export type MailClientFactory = (settings: MailSettings) => MailClient;
