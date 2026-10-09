import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { sandboxed, sandboxKind } from "./sandbox.ts";

const onMac = sandboxKind() === "macos-seatbelt";

test("generated code cannot read the project's keys or the held logins", { skip: !onMac }, async () => {
  const repo = await realpath(await mkdtemp(path.join(tmpdir(), "lab-sandbox-")));
  const data = path.join(repo, ".lab");
  await mkdir(path.join(data, "workspaces", "run-1", ".kit"), { recursive: true });
  await mkdir(path.join(repo, "shelf", "some_tool", "v1"), { recursive: true });
  await writeFile(path.join(repo, ".env"), "SECRET=1\n");
  await writeFile(path.join(data, "logins.json"), "{}\n");
  await writeFile(path.join(data, "workspaces", "run-1", ".kit", "context.json"), "{}\n");
  await writeFile(path.join(repo, "shelf", "some_tool", "v1", "tool.mjs"), "export default async () => ({});\n");

  const probe = `
    const fs = require("node:fs");
    const out = {};
    for (const [name, file] of Object.entries(JSON.parse(process.argv[1]))) {
      try { fs.readFileSync(file); out[name] = "read"; } catch (error) { out[name] = error.code; }
    }
    try { fs.writeFileSync(process.argv[2], "x"); out.write = "written"; } catch (error) { out.write = error.code; }
    process.stdout.write(JSON.stringify(out));
  `;
  const files = {
    env: path.join(repo, ".env"),
    logins: path.join(data, "logins.json"),
    kit: path.join(data, "workspaces", "run-1", ".kit", "context.json"),
    tool: path.join(repo, "shelf", "some_tool", "v1", "tool.mjs"),
  };
  const launch = sandboxed(
    process.execPath,
    ["-e", probe, JSON.stringify(files), path.join(process.env.HOME ?? "/", "lab-sandbox-probe.txt")],
    { repoRoot: repo, dataDir: data },
  );
  const result = spawnSync(launch.command, launch.args, { encoding: "utf8" });
  await rm(repo, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    env: "EPERM",
    logins: "EPERM",
    kit: "EPERM",
    tool: "read",
    write: "EPERM",
  });
});

test("the sandbox can be named off, and says so", () => {
  const before = process.env.LAB_SANDBOX;
  process.env.LAB_SANDBOX = "0";
  try {
    const launch = sandboxed("node", ["x"], { repoRoot: "/r", dataDir: "/r/.lab" });
    assert.deepEqual(launch, { command: "node", args: ["x"], kind: "none" });
  } finally {
    if (before === undefined) delete process.env.LAB_SANDBOX;
    else process.env.LAB_SANDBOX = before;
  }
});
