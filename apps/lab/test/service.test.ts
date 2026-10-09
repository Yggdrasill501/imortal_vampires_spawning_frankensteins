import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, afterEach, before, test } from "node:test";
import type { Interview, Invitation, LabEvent, ProcessDetail, Run } from "@repo/contract";
import { sql } from "@repo/db";
import { agentEnvironment, REPO_ROOT } from "../src/config.ts";
import { startDispatcher } from "../src/dispatcher.ts";
import { createLab, shutdownLab, waitForDatabase } from "../src/main.ts";
import { recover } from "../src/recovery.ts";
import { buildServer } from "../src/server.ts";
import type { MonsterSeam, OrchestratorSeam, ProcessProposal, Seams } from "../src/seams/types.ts";

const TEST_DATABASE_URL =
  process.env.LAB_TEST_DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5434/imortal_vampires_spawning_frankenstains_test";

let current: {
  lab: Awaited<ReturnType<typeof createLab>>;
  server: Awaited<ReturnType<typeof buildServer>>;
} | null = null;

before(() => {
  execFileSync("pnpm", ["--filter", "@repo/db", "migrate"], {
    cwd: REPO_ROOT,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
});

afterEach(async () => {
  if (!current) return;
  await shutdownLab(current.lab, current.server);
  current = null;
});

after(async () => {
  if (!current) return;
  await shutdownLab(current.lab, current.server);
});

async function start(seams?: Partial<Seams>, production = false) {
  const lab = await createLab({
    config: {
      databaseUrl: TEST_DATABASE_URL,
      port: 0,
      host: "127.0.0.1",
      dataDir: await mkdtemp(path.join(tmpdir(), "lab-data-")),
      shelfDir: await mkdtemp(path.join(tmpdir(), "lab-shelf-")),
      dispatchIntervalMs: 50,
      logLevel: "silent",
    },
    seams,
    production,
  });
  await sql`TRUNCATE interview, invitation_site RESTART IDENTITY CASCADE`.execute(lab.db);
  const server = await buildServer(lab);
  const url = await server.listen({ host: "127.0.0.1", port: 0 });
  await waitForDatabase(lab);
  lab.dbReady = true;
  await recover(lab);
  startDispatcher(lab);
  current = { lab, server };
  return { lab, url };
}

async function json<T>(url: string, pathName: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const response = await fetch(url + pathName, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  return { status: response.status, body: (await response.json()) as T };
}

const interviewBody = {
  language: "en",
  startedAt: "2026-10-08T21:00:00.000Z",
  endedAt: "2026-10-08T21:04:00.000Z",
  transcript: [{ speaker: "user" as const, text: "I hire people in OrangeHRM every week." }],
};

test("health answers with both facts", async () => {
  const { url } = await start();
  const { status, body } = await json<{ service: string; database: string }>(url, "/health");
  assert.equal(status, 200);
  assert.equal(body.service, "ok");
  assert.equal(body.database, "ok");
});

test("a saved interview becomes nothing_found and emits an event", async () => {
  const { lab, url } = await start();
  const events: LabEvent[] = [];
  const stop = lab.events.subscribe((event) => events.push(event));
  const saved = await json<Interview>(url, "/interviews", {
    method: "POST",
    body: JSON.stringify(interviewBody),
  });
  assert.equal(saved.status, 201);
  assert.equal(saved.body.status, "being_read");
  await waitUntil(async () => (await json<Interview>(url, `/interviews/${saved.body.id}`)).body.status === "nothing_found");
  assert.ok(events.some((event) => event.kind === "interview.status" && event.status === "nothing_found"));
  stop();
});

test("a scripted orchestrator stores proposals and remove works only while proposed", async () => {
  const { url } = await start({
    orchestrator: scriptedOrchestrator([proposal("Hire", "example.com"), proposal("Leave", "mail.example")]),
  });
  const saved = await json<Interview>(url, "/interviews", {
    method: "POST",
    body: JSON.stringify(interviewBody),
  });
  await waitUntil(async () => (await json<Interview>(url, `/interviews/${saved.body.id}`)).body.status === "proposed");
  const interview = (await json<Interview>(url, `/interviews/${saved.body.id}`)).body;
  assert.deepEqual(interview.processes.map((process) => process.name), ["Hire", "Leave"]);
  const removed = await json<{ removed: true }>(url, `/processes/${interview.processes[0]!.id}`, {
    method: "DELETE",
  });
  assert.equal(removed.status, 200);
  const after = (await json<Interview>(url, `/interviews/${saved.body.id}`)).body;
  assert.deepEqual(after.processes.map((process) => process.name), ["Leave"]);
});

test("invitation stores and keeps a login, and refuses a site nobody needs", async () => {
  const { url } = await start({ orchestrator: scriptedOrchestrator([proposal("Hire", "example.com")]) });
  const saved = await json<Interview>(url, "/interviews", {
    method: "POST",
    body: JSON.stringify(interviewBody),
  });
  await waitUntil(async () => (await json<Interview>(url, `/interviews/${saved.body.id}`)).body.status === "proposed");
  const secret = "test-password-never-returned";
  const put = await json<Invitation>(url, "/invitation", {
    method: "PUT",
    body: JSON.stringify({
      sites: [{ site: "example.com", kind: "website", login: { name: "Admin", password: secret } }],
    }),
  });
  assert.equal(put.status, 200);
  assert.equal(put.body.sites[0]?.loginHeld, true);
  assert.doesNotMatch(JSON.stringify(put.body), new RegExp(secret));
  const kept = await json<Invitation>(url, "/invitation", {
    method: "PUT",
    body: JSON.stringify({ sites: [{ site: "example.com", kind: "website" }] }),
  });
  assert.equal(kept.body.sites[0]?.loginHeld, true);
  const refused = await json<{ error: string; code: string }>(url, "/invitation", {
    method: "PUT",
    body: JSON.stringify({
      sites: [
        { site: "example.com", kind: "website" },
        { site: "evil.example", kind: "website" },
      ],
    }),
  });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.code, "invalid");
});

test("start refuses a missing login, then queues one monster run per process", async () => {
  const { url } = await start({ orchestrator: scriptedOrchestrator([proposal("Hire", "example.com")]) });
  const saved = await json<Interview>(url, "/interviews", {
    method: "POST",
    body: JSON.stringify(interviewBody),
  });
  await waitUntil(async () => (await json<Interview>(url, `/interviews/${saved.body.id}`)).body.status === "proposed");
  await json(url, "/invitation", {
    method: "PUT",
    body: JSON.stringify({ sites: [{ site: "example.com", kind: "website" }] }),
  });
  const missing = await json<{ error: string; code: string }>(url, `/interviews/${saved.body.id}/start`, {
    method: "POST",
  });
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /example.com needs a login/);
  await json(url, "/invitation", {
    method: "PUT",
    body: JSON.stringify({
      sites: [{ site: "example.com", kind: "website", login: { name: "Admin", password: "secret" } }],
    }),
  });
  const started = await json<{ interview: Interview }>(url, `/interviews/${saved.body.id}/start`, {
    method: "POST",
  });
  assert.equal(started.status, 200);
  assert.equal(started.body.interview.processes[0]?.status, "queued");
  const again = await json<{ error: string; code: string }>(url, `/interviews/${saved.body.id}/start`, {
    method: "POST",
  });
  assert.equal(again.status, 409);
});

test("CURSOR_API_KEY stays out of the agent environment unless asked", async () => {
  process.env.CURSOR_API_KEY = "cursor-secret";
  const { lab } = await start();
  assert.equal(lab.config.cursorApiKey, "cursor-secret");
  assert.equal(agentEnvironment({ ...lab.config, agentUseApiKey: false }).CURSOR_API_KEY, undefined);
  assert.equal(agentEnvironment({ ...lab.config, agentUseApiKey: true }).CURSOR_API_KEY, "cursor-secret");
  assert.equal(process.env.CURSOR_API_KEY, undefined);
});

test("unknown routes use the contract error shape", async () => {
  const { url } = await start();
  const { status, body } = await json<{ error: string; code: string }>(url, "/missing");
  assert.equal(status, 404);
  assert.equal(body.code, "not_found");
  assert.equal(body.error, "Nothing by that name exists in the lab.");
});

test("a learned process is checked by the lab, sealed, and run with no model", async () => {
  // The real runner, install check and scheduling; only the agent and the reader are scripted.
  const { url } = await start(
    { orchestrator: scriptedOrchestrator([proposal("Greet", "example.com")]), monster: scriptedMonster },
    true,
  );
  const saved = await json<Interview>(url, "/interviews", { method: "POST", body: JSON.stringify(interviewBody) });
  await waitUntil(async () => (await json<Interview>(url, `/interviews/${saved.body.id}`)).body.status === "proposed");
  await json(url, "/invitation", {
    method: "PUT",
    body: JSON.stringify({
      sites: [{ site: "example.com", kind: "website", login: { name: "Admin", password: "secret" } }],
    }),
  });
  const started = await json<{ interview: Interview }>(url, `/interviews/${saved.body.id}/start`, { method: "POST" });
  const processId = started.body.interview.processes[0]!.id;
  const read = async () => (await json<ProcessDetail>(url, `/processes/${processId}`)).body;
  await waitUntil(async () => ["awaiting_seal", "failed_to_learn"].includes((await read()).status), 20_000);
  const learned = await read();
  assert.equal(learned.status, "awaiting_seal", learned.reason ?? "");

  const tools = await json<{ tools: Array<{ name: string }> }>(url, "/tools");
  assert.deepEqual(tools.body.tools.map((tool) => tool.name).sort(), ["greet_person", "list_things"]);
  const verification = await json<{ runs: Run[] }>(url, `/runs?processId=${processId}`);
  assert.equal(verification.body.runs.length, 1);
  assert.equal(verification.body.runs[0]?.status, "passed");
  assert.equal(verification.body.runs[0]?.modelCalls, 0);
  assert.equal(verification.body.runs[0]?.proofValue, "Hello Grace.");

  const sealed = await json<ProcessDetail>(url, `/processes/${processId}/seal`, { method: "POST" });
  assert.equal(sealed.body.status, "sealed");
  assert.ok(sealed.body.nextRunAt, "a sealed process has a next run time");

  // Everything that was waiting while it learned is already handled, so a run now finds nothing new.
  await json(url, `/processes/${processId}/run`, { method: "POST" });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const after = await json<{ runs: Run[] }>(url, `/runs?processId=${processId}`);
  assert.equal(after.body.runs.length, 1);
  assert.equal((await read()).status, "sealed");
});

const scriptedMonster: MonsterSeam = {
  async work(input) {
    const draft = async (name: string, meta: object, code: string) => {
      const folder = path.join(input.workspace, "tools", name);
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, "meta.json"), JSON.stringify({ name, sites: [], connectors: [], effect: "reads", ...meta }));
      await writeFile(path.join(folder, "tool.mjs"), code);
      return folder;
    };
    const folders = [
      await draft(
        "list_things",
        { description: "Lists the things.", lists_items: true, input: {}, output: { items: "The things." } },
        `export default async function listThings() {
  return { items: [
    { id: "1", label: "One", data: { name: "Ada" } },
    { id: "2", label: "Two", data: { name: "Grace" } },
  ] };
}
`,
      ),
      await draft(
        "greet_person",
        { description: "Greets one person.", lists_items: false, input: { name: "The name." }, output: { greeting: "The greeting." } },
        `export default async function greetPerson({ input }) {
  return { greeting: "Hello " + input.name + "." };
}
`,
      ),
    ];
    await writeFile(
      path.join(input.workspace, "process.json"),
      JSON.stringify({
        steps: [
          { id: "source", tool: "list_things", input: {} },
          { id: "greet", tool: "greet_person", input: { name: "$item.name" } },
        ],
        check: "$steps.greet.greeting",
        check_name: "Greeting",
        check_description: "The greeting that was made.",
      }),
    );
    for (const folder of folders) {
      const refused = await input.hooks.createTool(folder);
      if (refused) return { outcome: "gave_up", error: refused.error };
    }
    const refused = await input.hooks.saveProcess(["list_things", "greet_person"], {
      name: "Greeting",
      description: "The greeting that was made.",
    });
    if (refused) return { outcome: "gave_up", error: refused.error };
    return { outcome: "done" };
  },
};

function proposal(name: string, site: string): ProcessProposal {
  return {
    name,
    description: `${name} is a daily job.`,
    successCriterion: "The record is there.",
    sites: [{ site, kind: "website", loginNeeded: true }],
    schedule: { kind: "daily", time: "09:00" },
  };
}

function scriptedOrchestrator(proposals: ProcessProposal[]): OrchestratorSeam {
  return {
    async propose() {
      return { proposals };
    },
  };
}

async function waitUntil(check: () => Promise<boolean>, timeoutMs = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for the lab.");
}
