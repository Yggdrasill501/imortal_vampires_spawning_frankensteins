import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { Runner } from "./runner.ts";
import type { Chain, RunScope } from "./types.ts";

const scratch: string[] = [];

afterEach(async () => {
  await Promise.all(scratch.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

test("lists items, runs the rest of the chain, and replays one tool", async () => {
  const shelfDir = await makeShelf();
  const runner = new Runner({ shelfDir, headless: true });
  const listed = await runner.listItems(chain, emptyScope);
  assert.equal(listed.status, "passed");
  assert.equal(listed.modelCalls, 0);
  assert.deepEqual(listed.items, [{ id: "1", label: "One", data: { name: "Ada" } }]);

  const ran = await runner.runItem(chain, listed.items[0]!, emptyScope);
  assert.equal(ran.status, "passed");
  assert.equal(ran.modelCalls, 0);
  assert.equal(ran.proofValue, "Hello Ada.");
  assert.equal(ran.steps[0]?.result?.greeting, "Hello Ada.");

  const replayed = await runner.replayTool("greet_person", 1, { name: "Ada" }, emptyScope);
  assert.equal(replayed.status, "passed");
  assert.equal(replayed.modelCalls, 0);
  assert.equal(replayed.result?.greeting, "Hello Ada.");
});

test("returns a structured install failure instead of throwing", async () => {
  const shelfDir = await mkdtemp(path.join(tmpdir(), "lab-shelf-"));
  scratch.push(shelfDir);
  const runner = new Runner({ shelfDir, headless: true });
  const listed = await runner.listItems(chain, emptyScope);
  assert.equal(listed.status, "failed");
  assert.match(listed.error ?? "", /^install: /);
  assert.equal(listed.modelCalls, 0);
});

test("refuses a tool whose site is outside the process", async () => {
  const shelfDir = await makeShelf();
  await writeVersion(shelfDir, "touch_site", 1, {
    name: "touch_site",
    description: "Names an outside site.",
    sites: ["evil.example"],
    connectors: [],
    effect: "reads",
    lists_items: false,
    input: { name: "Unused." },
    output: { greeting: "Unused." },
  }, `export default async function touchSite({ input }) {
  return { greeting: input.name };
}
`);
  const runner = new Runner({ shelfDir, headless: true });
  const ran = await runner.runItem(
    {
      steps: [
        { id: "source", tool: "list_things", input: {} },
        { id: "touch", tool: "touch_site", input: { name: "$item.name" } },
      ],
      check: "$steps.touch.greeting",
    },
    { id: "1", label: "One", data: { name: "Ada" } },
    {
      invitation: { sites: ["evil.example"], connectors: [] },
      process: { sites: [], connectors: [] },
    },
  );
  assert.equal(ran.status, "refused");
  assert.equal(ran.refusals[0]?.kind, "scope");
  assert.equal(ran.refusals[0]?.site, "evil.example");
  assert.match(ran.error ?? "", /^install: /);
});

test("hands a tool that declares gmail a connector that searches the mailbox through the worker", async () => {
  const shelfDir = await makeShelf();
  await writeVersion(shelfDir, "list_mail", 1, {
    name: "list_mail",
    description: "Lists recent messages from the mailbox.",
    sites: [],
    connectors: ["gmail"],
    effect: "reads",
    lists_items: true,
    input: {},
    output: { items: "The recent messages." },
  }, `export default async function listMail({ connectors }) {
  const found = await connectors.gmail.call("search", { limit: 2 });
  return {
    items: found.messages.map((message) => ({
      id: message.id,
      label: message.subject,
      data: { from: message.from, date: message.date },
    })),
  };
}
`);
  const fixture = [1, 2, 3].map((uid) => ({
    uid,
    messageId: `<message-${uid}@example.com>`,
    subject: `Message ${uid}`,
    from: `sender${uid}@example.com`,
    date: `2026-02-0${uid}T09:00:00.000Z`,
    text: `Body ${uid}.`,
  }));
  const mailScope: RunScope = {
    invitation: { sites: [], connectors: ["gmail"] },
    process: { sites: [], connectors: ["gmail"] },
  };
  const mailChain: Chain = { steps: [{ id: "source", tool: "list_mail", input: {} }], check: "$item.from" };

  const runner = new Runner({
    shelfDir,
    headless: true,
    mail: { user: "mailbox@example.com", pass: "app-password-value", host: "imap.example.com", port: 993, fixture },
  });
  const listed = await runner.listItems(mailChain, mailScope);
  assert.equal(listed.error, null);
  assert.equal(listed.status, "passed");
  assert.deepEqual(listed.items.map((item) => item.label), ["Message 3", "Message 2"]);
  assert.equal(listed.items[0]?.id, "<message-3@example.com>");

  const unconfigured = new Runner({ shelfDir, headless: true, mail: null });
  const failed = await unconfigured.listItems(mailChain, mailScope);
  assert.equal(failed.status, "failed");
  assert.equal(failed.error, "tool: The gmail connector needs LAB_MAIL_USER and LAB_MAIL_PASS to be set.");

  const undeclared = await runner.listItems(chain, emptyScope);
  assert.equal(undeclared.status, "passed");
});

const emptyScope: RunScope = {
  invitation: { sites: [], connectors: [] },
  process: { sites: [], connectors: [] },
};

const chain: Chain = {
  steps: [
    { id: "source", tool: "list_things", input: {} },
    { id: "greet", tool: "greet_person", input: { name: "$item.name" } },
  ],
  check: "$steps.greet.greeting",
};

async function makeShelf(): Promise<string> {
  const shelfDir = await mkdtemp(path.join(tmpdir(), "lab-shelf-"));
  scratch.push(shelfDir);
  await writeVersion(shelfDir, "list_things", 1, {
    name: "list_things",
    description: "Lists incoming items.",
    sites: [],
    connectors: [],
    effect: "reads",
    lists_items: true,
    input: {},
    output: { items: "The incoming items." },
  }, `export default async function listThings({ log }) {
  log("Listed the incoming items.");
  return { items: [{ id: "1", label: "One", data: { name: "Ada" } }] };
}
`);
  await writeVersion(shelfDir, "greet_person", 1, {
    name: "greet_person",
    description: "Greets one person.",
    sites: [],
    connectors: [],
    effect: "reads",
    lists_items: false,
    input: { name: "The person's name." },
    output: { greeting: "The greeting." },
  }, `export default async function greetPerson({ input, log }) {
  log("Read the item name.");
  return { greeting: \`Hello \${input.name}.\` };
}
`);
  return shelfDir;
}

async function writeVersion(
  shelfDir: string,
  name: string,
  version: number,
  meta: object,
  code: string,
): Promise<void> {
  const folder = path.join(shelfDir, name, `v${version}`);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "meta.json"), JSON.stringify(meta));
  await writeFile(path.join(folder, "tool.mjs"), code);
}
