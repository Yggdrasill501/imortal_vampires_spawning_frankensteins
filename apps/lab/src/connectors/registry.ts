import { GMAIL_ACTIONS, createGmailConnector } from "./gmail.ts";
import { createImapClient } from "./imap-client.ts";
import { createMemoryClient } from "./memory-client.ts";
import type {
  Connector,
  ConnectorContext,
  ConnectorDefinition,
  ConnectorHandle,
  MailClientFactory,
  MailSettings,
} from "./types.ts";

/** Every connector a tool may declare, with the fixed list of actions it allows. */
export const CONNECTORS: Readonly<Record<string, ConnectorDefinition>> = Object.freeze({
  gmail: {
    name: "gmail",
    actions: GMAIL_ACTIONS,
    create: (context) =>
      createGmailConnector(context.mail, context.clientFactory ?? clientFactoryFor(context.mail)),
  },
});

export interface BoundConnectors {
  /** What the tool is handed: `connectors.<name>.call(action, args)` for its declared names only. */
  connectors: Record<string, Connector>;
  /** Called by the runner when the step ends, whether it passed, failed or timed out. */
  close(): Promise<void>;
}

/**
 * Builds the connectors for one tool. A declared name that is in the registry
 * gets the real connector; an unknown name gets one that refuses every call.
 * A declared connector whose settings are missing throws here, before the tool runs.
 */
export function connectorsFor(declared: readonly string[], context: ConnectorContext): BoundConnectors {
  const handles: ConnectorHandle[] = [];
  const connectors: Record<string, Connector> = {};
  for (const name of declared) {
    const definition = CONNECTORS[name];
    if (!definition) {
      connectors[name] = {
        call: async () => {
          throw new Error(`The ${name} connector is not available in this runner.`);
        },
      };
      continue;
    }
    const handle = definition.create(context);
    handles.push(handle);
    connectors[name] = { call: (action, args) => handle.call(action, args) };
  }
  return {
    connectors,
    close: async () => {
      await Promise.all(handles.map((handle) => handle.close()));
    },
  };
}

function clientFactoryFor(mail: MailSettings | null): MailClientFactory {
  const fixture = mail?.fixture;
  return fixture ? () => createMemoryClient(fixture) : createImapClient;
}
