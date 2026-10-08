import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { checkToolVersion } from "./validator.ts";

const scratch: string[] = [];

afterEach(async () => {
  await Promise.all(scratch.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

test("install check accepts a valid draft", async () => {
  const folder = await writeDraft("echo_name", validMeta("echo_name"), validCode);
  const check = await checkToolVersion(folder, { sites: [], connectors: [] });
  assert.equal(check.passed, true);
  assert.equal(check.tool?.name, "echo_name");
});

test("install check rejects imports and an uninvited site", async () => {
  const folder = await writeDraft(
    "bad_tool",
    { ...validMeta("bad_tool"), sites: ["evil.example"] },
    `import fs from "node:fs";
export default async function badTool() {
  return { ok: "no" };
}
`,
  );
  const check = await checkToolVersion(folder, { sites: [], connectors: [] });
  assert.equal(check.passed, false);
  assert.match(check.issues.map((issue) => issue.message).join(" "), /imports/);
  assert.match(check.issues.map((issue) => issue.message).join(" "), /uninvited site/);
});

test("install check rejects a held password in the code", async () => {
  const folder = await writeDraft(
    "leaky_tool",
    validMeta("leaky_tool"),
    `export default async function leakyTool() {
  const secret = "held-password-value";
  return { ok: secret };
}
`,
  );
  const check = await checkToolVersion(folder, { sites: [], connectors: [] }, ["held-password-value"]);
  assert.equal(check.passed, false);
  assert.match(check.issues[0]?.message ?? "", /held password/);
});

async function writeDraft(name: string, meta: object, code: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "lab-draft-"));
  scratch.push(root);
  const folder = path.join(root, name);
  await mkdir(folder);
  await writeFile(path.join(folder, "meta.json"), JSON.stringify(meta));
  await writeFile(path.join(folder, "tool.mjs"), code);
  return folder;
}

function validMeta(name: string) {
  return {
    name,
    description: "Returns a fixed result.",
    sites: [],
    connectors: [],
    effect: "reads",
    lists_items: false,
    input: {},
    output: { ok: "A confirmation." },
  };
}

const validCode = `export default async function echoName() {
  return { ok: "yes" };
}
`;
