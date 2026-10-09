import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { GMAIL_ACTIONS, createGmailConnector } from "./gmail.ts";
import { createMemoryClient, type MemoryMailClient, type MemoryMessage } from "./memory-client.ts";
import { connectorsFor } from "./registry.ts";
import { readMailSettings, redactMail } from "./settings.ts";
import type { MailSettings } from "./types.ts";

const settings: MailSettings = {
  user: "mailbox@example.com",
  pass: "app-password-value",
  host: "imap.example.com",
  port: 993,
};

function message(uid: number, overrides: Partial<MemoryMessage> = {}): MemoryMessage {
  return {
    uid,
    messageId: `<message-${uid}@example.com>`,
    subject: `Message ${uid}`,
    from: `sender${uid}@example.com`,
    date: new Date(Date.UTC(2026, 0, uid, 12)).toISOString(),
    text: `Body of message ${uid}.`,
    ...overrides,
  };
}

function connector(messages: MemoryMessage[]) {
  const client = createMemoryClient(messages);
  const handle = createGmailConnector(settings, () => client);
  return { client, handle };
}

test("search returns newest first and respects the limit and the maximum", async () => {
  const many = Array.from({ length: 60 }, (_, index) => message(index + 1));
  const { handle } = connector(many);

  const defaults = await handle.call("search", {});
  const ids = (defaults.messages as Array<{ id: string }>).map((entry) => entry.id);
  assert.equal(ids.length, 20);
  assert.equal(ids[0], "<message-60@example.com>");
  assert.equal(ids[19], "<message-41@example.com>");

  const limited = await handle.call("search", { limit: 3 });
  assert.deepEqual(
    (limited.messages as Array<{ subject: string }>).map((entry) => entry.subject),
    ["Message 60", "Message 59", "Message 58"],
  );

  const capped = await handle.call("search", { limit: 500 });
  assert.equal((capped.messages as unknown[]).length, 50);
  await handle.close();
});

test("search orders by date, not by uid, and filters by subject, sender and unread", async () => {
  const { handle } = connector([
    message(1, { date: "2026-03-03T10:00:00.000Z", seen: true }),
    message(2, { date: "2026-03-01T10:00:00.000Z", subject: "Message two" }),
    message(3, { date: "2026-03-02T10:00:00.000Z", from: "other@example.com" }),
  ]);
  const all = await handle.call("search", {});
  assert.deepEqual(
    (all.messages as Array<{ id: string }>).map((entry) => entry.id),
    ["<message-1@example.com>", "<message-3@example.com>", "<message-2@example.com>"],
  );
  const bySubject = await handle.call("search", { subject: "two" });
  assert.equal((bySubject.messages as unknown[]).length, 1);
  const bySender = await handle.call("search", { from: "other@" });
  assert.deepEqual(bySender.messages, [
    {
      id: "<message-3@example.com>",
      subject: "Message 3",
      from: "other@example.com",
      date: "2026-03-02T10:00:00.000Z",
    },
  ]);
  const unread = await handle.call("search", { unreadOnly: true });
  assert.equal((unread.messages as unknown[]).length, 2);
  await handle.close();
});

test("the same message keeps the same id across calls, with the uid as a fallback", async () => {
  const { handle } = connector([message(7), message(8, { messageId: undefined })]);
  const first = await handle.call("search", {});
  const second = await handle.call("search", { limit: 50 });
  assert.deepEqual(first.messages, second.messages);
  const ids = (first.messages as Array<{ id: string }>).map((entry) => entry.id);
  assert.deepEqual(ids, ["uid:8", "<message-7@example.com>"]);

  const readByMessageId = await handle.call("read", { id: "<message-7@example.com>" });
  assert.equal(readByMessageId.id, "<message-7@example.com>");
  const readByUid = await handle.call("read", { id: "uid:8" });
  assert.equal(readByUid.id, "uid:8");
  await handle.close();
});

test("read returns the plain text body", async () => {
  const { handle } = connector([
    message(1, { text: "Line one.\r\nLine two.\r\n" }),
    message(2, { text: "", html: "<p>Hello &amp; welcome.</p><p>Second line.</p>" }),
  ]);
  const plain = await handle.call("read", { id: "<message-1@example.com>" });
  assert.deepEqual(plain, {
    id: "<message-1@example.com>",
    subject: "Message 1",
    from: "sender1@example.com",
    date: "2026-01-01T12:00:00.000Z",
    text: "Line one.\nLine two.\n",
  });
  const alternative = await handle.call("read", { id: "<message-2@example.com>" });
  assert.equal(alternative.text, "");

  await assert.rejects(handle.call("read", { id: "<missing@example.com>" }), /No message has the id/);
  await assert.rejects(handle.call("read", {}), /needs a message id/);
  await handle.close();
});

test("an unknown action is refused without touching the client", async () => {
  const { client, handle } = connector([message(1)]);
  for (const action of ["send", "delete", "move", "flag", "expunge", ""]) {
    await assert.rejects(handle.call(action, {}), new RegExp(`does not allow the action "${action}"`));
  }
  assert.deepEqual(client.calls, []);
  await handle.close();
  assert.deepEqual(client.calls, []);
  assert.deepEqual([...GMAIL_ACTIONS], ["search", "read"]);
});

test("the mailbox is opened read-only, once per step, and closed with the step", async () => {
  const { client, handle } = connector([message(1)]);
  await handle.call("search", {});
  await handle.call("read", { id: "<message-1@example.com>" });
  assert.deepEqual(client.locks, [{ path: "INBOX", readOnly: true }]);
  assert.equal(client.calls.filter((call) => call === "connect").length, 1);
  assert.equal(client.closed, false);
  await handle.close();
  assert.equal(client.released, 1);
  assert.equal(client.closed, true);
});

test("the connector code has no path that writes to the mailbox", async () => {
  const source = await readFile(new URL("./gmail.ts", import.meta.url), "utf8");
  const types = await readFile(new URL("./types.ts", import.meta.url), "utf8");
  for (const forbidden of [
    "messageFlagsAdd",
    "messageFlagsSet",
    "messageFlagsRemove",
    "messageDelete",
    "messageMove",
    "messageCopy",
    "append",
    "mailboxCreate",
    "mailboxDelete",
    "mailboxRename",
    "setFlagColor",
  ]) {
    assert.equal(source.includes(forbidden), false, `gmail.ts mentions ${forbidden}`);
    assert.equal(types.includes(forbidden), false, `types.ts mentions ${forbidden}`);
  }
});

test("missing settings give a clear error", () => {
  assert.throws(
    () => createGmailConnector(null),
    /The gmail connector needs LAB_MAIL_USER and LAB_MAIL_PASS to be set\./,
  );
  assert.throws(() => connectorsFor(["gmail"], { mail: null }), /LAB_MAIL_USER and LAB_MAIL_PASS/);
  assert.equal(readMailSettings({}), null);
  assert.equal(readMailSettings({ LAB_MAIL_USER: "mailbox@example.com" }), null);
  assert.deepEqual(readMailSettings({ LAB_MAIL_USER: "mailbox@example.com", LAB_MAIL_PASS: "x" }), {
    user: "mailbox@example.com",
    pass: "x",
    host: "imap.gmail.com",
    port: 993,
  });
  assert.throws(
    () =>
      readMailSettings({ LAB_MAIL_USER: "mailbox@example.com", LAB_MAIL_PASS: "x", LAB_MAIL_PORT: "many" }),
    /LAB_MAIL_PORT is not valid/,
  );
});

test("an error containing the password is redacted to one line", async () => {
  const failing: MemoryMailClient = {
    ...createMemoryClient([]),
    async connect() {
      throw new Error(
        `Login failed for ${settings.user} with ${settings.pass}\nraw: AUTHENTICATE PLAIN ${settings.pass}`,
      );
    },
  };
  const handle = createGmailConnector(settings, () => failing);
  await assert.rejects(handle.call("search", {}), (error: Error) => {
    assert.equal(error.message, "Login failed for [redacted] with [redacted]");
    return true;
  });
  await handle.close();
  assert.equal(redactMail("ok", null), "ok");
});

test("a tool that does not declare the connector receives none", async () => {
  const none = connectorsFor([], { mail: settings });
  assert.deepEqual(none.connectors, {});
  await none.close();

  const other = connectorsFor(["calendar"], { mail: settings });
  assert.deepEqual(Object.keys(other.connectors), ["calendar"]);
  await assert.rejects(other.connectors.calendar!.call("search", {}), /calendar connector is not available/);
  assert.equal("gmail" in other.connectors, false);
  await other.close();

  const declared = connectorsFor(["gmail"], {
    mail: settings,
    clientFactory: () => createMemoryClient([message(1)]),
  });
  assert.deepEqual(Object.keys(declared.connectors), ["gmail"]);
  const found = await declared.connectors.gmail!.call("search", {});
  assert.equal((found.messages as unknown[]).length, 1);
  await declared.close();
});
