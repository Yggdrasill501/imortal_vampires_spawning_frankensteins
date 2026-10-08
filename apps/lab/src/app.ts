import type { Kysely, Transaction } from "@repo/db";
import type { DB } from "@repo/db";
import type { Config } from "./config.ts";
import type { EventBus } from "./events.ts";
import type { Seams } from "./seams/types.ts";

export type Db = Kysely<DB>;
export type Trx = Transaction<DB>;

export interface Lab {
  config: Config;
  db: Db;
  events: EventBus;
  seams: Seams;
  dbReady: boolean;
  stop: AbortController;
  jobs: Map<string, AbortController>;
  wakeDispatcher: () => void;
  stopDispatcher: () => void;
  log: {
    info: (obj: object, msg?: string) => void;
    debug: (obj: object, msg?: string) => void;
    error: (obj: object, msg?: string) => void;
  };
}

export function jobKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}
