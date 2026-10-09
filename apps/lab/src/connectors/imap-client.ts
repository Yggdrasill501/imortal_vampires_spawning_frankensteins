import { ImapFlow } from "imapflow";
import type { MailClient, MailSettings } from "./types.ts";

/**
 * The one place that talks to a real mail server. If Gmail behaves differently
 * from what the connector expects (TLS, authentication, timeouts), adjust the
 * options here. The client is handed to the connector as-is; the connector only
 * ever calls the read-only methods listed in MailClient.
 */
export function createImapClient(settings: MailSettings): MailClient {
  return new ImapFlow({
    host: settings.host,
    port: settings.port,
    secure: true,
    auth: { user: settings.user, pass: settings.pass },
    logger: false,
    disableAutoIdle: true,
  });
}
