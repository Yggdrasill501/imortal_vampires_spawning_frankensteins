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
