import assert from "node:assert/strict";
import { test } from "node:test";
import { SCHEDULE_MINUTES_MAX, SCHEDULE_MINUTES_MIN, type TranscriptTurn } from "@repo/contract";
import type { ProcessProposal } from "../seams/types.ts";
import { isSiteIdentity, siteIdentity } from "../site.ts";
import { createOrchestrator, parseKnownSystems, type Ask, type KnownSystem } from "./index.ts";
import { extractJson } from "./parse.ts";

const KNOWN_SYSTEMS_JSON =
  '[{"name":"HR system","site":"hr.example.com","kind":"website","loginNeeded":true},{"name":"Mailbox","site":"gmail","kind":"connector","loginNeeded":false}]';
const knownSystems = parseKnownSystems(KNOWN_SYSTEMS_JSON) as KnownSystem[];

const threeTasks: TranscriptTurn[] = [
  { speaker: "agent", text: "What do you do during your shift?" },
  {
    speaker: "user",
    text: "I work the night shift as an HR clerk. Every night I read the new-hire emails and type each person into the HR system, about five minutes each.",
  },
  { speaker: "agent", text: "What else?" },
  { speaker: "user", text: "Then I read the leave-request emails and book the leave in the HR system." },
  { speaker: "user", text: "Last, I read the leaver emails and end that person's employment in the HR system." },
];

const threeProcesses = {
  processes: [
    {
      name: "Enter new hires",
      description: "Read each new-hire email and type the person into the HR system, about five minutes each, every night.",
      successCriterion: "The person appears in the HR system.",
      sites: ["gmail", "hr.example.com"],
      schedule: { kind: "daily", time: "22:00" },
      source: "New-hire emails arriving in the mailbox.",
    },
    {
      name: "Book leave",
      description: "Read each leave-request email and book the leave in the HR system.",
      successCriterion: "The leave shows in the HR system.",
      sites: ["gmail", "hr.example.com"],
      schedule: { kind: "every", minutes: 60 },
      source: "Leave-request emails arriving in the mailbox.",
    },
    {
      name: "End employment",
      description: "Read each leaver email and end that person's employment in the HR system.",
      successCriterion: "The person's employment is ended in the HR system.",
      sites: ["gmail", "hr.example.com"],
      schedule: { kind: "daily", time: "23:30" },
      source: "Leaver emails arriving in the mailbox.",
    },
  ],
  skipped: [],
};

test("three tasks give three proposals in order, each in the form the lab accepts", async () => {
  const ask = scripted([JSON.stringify(threeProcesses)]);
  const orchestrator = createOrchestrator({ ask, knownSystems });
  const result = await orchestrator.propose(input(threeTasks));
  assert.ok("proposals" in result, JSON.stringify(result));
  assert.deepEqual(
    result.proposals.map((proposal) => proposal.name),
    ["Enter new hires", "Book leave", "End employment"],
  );
  for (const proposal of result.proposals) assert.equal(validProposal(proposal), true);
  const [first] = result.proposals;
  assert.deepEqual(first?.sites, [
    { site: "gmail", kind: "connector", loginNeeded: false },
    { site: "hr.example.com", kind: "website", loginNeeded: true },
  ]);
  assert.deepEqual(first?.schedule, { kind: "daily", time: "22:00" });
  assert.match(first?.description ?? "", /New-hire emails arriving in the mailbox\.$/);
  assert.equal(ask.prompts.length, 1);
  assert.match(ask.prompts[0] ?? "", /night shift as an HR clerk/);
  assert.match(ask.prompts[0] ?? "", /hr\.example\.com/);
});

test("kind and loginNeeded come from the known list, not from the model", async () => {
  const answer = {
    processes: [
      {
        ...threeProcesses.processes[0],
        sites: [{ site: "https://hr.example.com/login", kind: "connector", loginNeeded: false }, "Mailbox"],
      },
    ],
  };
  const orchestrator = createOrchestrator({ ask: scripted([JSON.stringify(answer)]), knownSystems });
  const result = await orchestrator.propose(input(threeTasks));
  assert.ok("proposals" in result, JSON.stringify(result));
  assert.deepEqual(result.proposals[0]?.sites, [
    { site: "hr.example.com", kind: "website", loginNeeded: true },
    { site: "gmail", kind: "connector", loginNeeded: false },
  ]);
});

test("an answer wrapped in a code fence is still parsed", async () => {
  const text = `Here is the list you asked for:\n\n\`\`\`json\n${JSON.stringify(threeProcesses, null, 2)}\n\`\`\`\n\nLet me know if you need changes.`;
  const orchestrator = createOrchestrator({ ask: scripted([text]), knownSystems });
  const result = await orchestrator.propose(input(threeTasks));
  assert.ok("proposals" in result, JSON.stringify(result));
  assert.equal(result.proposals.length, 3);
});

test("extractJson finds the document inside a sentence", () => {
  assert.deepEqual(extractJson('Sure. {"processes": []} Done.'), { processes: [] });
  assert.deepEqual(extractJson("```\n{\"a\": 1}\n```"), { a: 1 });
  assert.equal(extractJson("no json here"), undefined);
});

test("a site not on the known list fails the check, the retry states it, and a good second answer succeeds", async () => {
  const bad = {
    processes: [{ ...threeProcesses.processes[0], sites: ["bank.example.com"] }],
  };
  const ask = scripted([JSON.stringify(bad), JSON.stringify(threeProcesses)]);
  const orchestrator = createOrchestrator({ ask, knownSystems });
  const result = await orchestrator.propose(input(threeTasks));
  assert.ok("proposals" in result, JSON.stringify(result));
  assert.equal(result.proposals.length, 3);
  assert.equal(ask.prompts.length, 2);
  assert.match(ask.prompts[1] ?? "", /previous answer was rejected/);
  assert.match(ask.prompts[1] ?? "", /bank\.example\.com/);
  assert.match(ask.prompts[1] ?? "", /not on the known list/);
});

test("two bad answers return an error", async () => {
  const noCriterion = { processes: [{ ...threeProcesses.processes[0], successCriterion: "" }] };
  const ask = scripted(["I cannot answer that.", JSON.stringify(noCriterion)]);
  const orchestrator = createOrchestrator({ ask, knownSystems });
  const result = await orchestrator.propose(input(threeTasks));
  assert.ok("error" in result);
  assert.match(result.error, /two attempts/);
  assert.match(result.error, /successCriterion/);
  assert.equal(ask.prompts.length, 2);
});

test("an invalid schedule fails the check", async () => {
  const bad = { processes: [{ ...threeProcesses.processes[0], schedule: { kind: "every", minutes: 0 } }] };
  const ask = scripted([JSON.stringify(bad), JSON.stringify(bad)]);
  const orchestrator = createOrchestrator({ ask, knownSystems });
  const result = await orchestrator.propose(input(threeTasks));
  assert.ok("error" in result);
  assert.match(result.error, /schedule/);
  assert.match(ask.prompts[1] ?? "", /invalid schedule/);
});

test("more than five processes fail the check", async () => {
  const six = { processes: Array.from({ length: 6 }, () => threeProcesses.processes[0]) };
  const ask = scripted([JSON.stringify(six), JSON.stringify(threeProcesses)]);
  const orchestrator = createOrchestrator({ ask, knownSystems });
  const result = await orchestrator.propose(input(threeTasks));
  assert.ok("proposals" in result, JSON.stringify(result));
  assert.match(ask.prompts[1] ?? "", /at most 5/);
});

test("an unsaid schedule becomes daily at 08:00", async () => {
  const { schedule: _unsaid, ...withoutSchedule } = threeProcesses.processes[0]!;
  const ask = scripted([JSON.stringify({ processes: [withoutSchedule] })]);
  const orchestrator = createOrchestrator({ ask, knownSystems });
  const result = await orchestrator.propose(input(threeTasks));
  assert.ok("proposals" in result, JSON.stringify(result));
  assert.deepEqual(result.proposals[0]?.schedule, { kind: "daily", time: "08:00" });
  assert.equal(validProposal(result.proposals[0]!), true);
  assert.match(ask.prompts[0] ?? "", /"08:00"/);
});

test("a task needing an unknown system is skipped, not proposed", async () => {
  const answer = {
    processes: [threeProcesses.processes[0]],
    skipped: [{ task: "Pay the invoices in the bank", reason: "The bank is not a known system." }],
  };
  const text = JSON.stringify(answer);
  const orchestrator = createOrchestrator({ ask: scripted([text, text]), knownSystems });
  const reading = await orchestrator.read(input(threeTasks));
  assert.ok("proposals" in reading, JSON.stringify(reading));
  assert.equal(reading.proposals.length, 1);
  assert.deepEqual(reading.skipped, [
    { task: "Pay the invoices in the bank", reason: "The bank is not a known system." },
  ]);
  const proposed = await orchestrator.propose(input(threeTasks));
  assert.ok("proposals" in proposed);
  assert.equal(proposed.proposals.length, 1);
  assert.equal("skipped" in proposed, false);
});

test("an empty transcript gives no proposals without asking the model", async () => {
  const ask = scripted([]);
  const orchestrator = createOrchestrator({ ask, knownSystems });
  for (const transcript of [[], [{ speaker: "agent" as const, text: "Hello?" }], [{ speaker: "user" as const, text: "  " }]]) {
    const result = await orchestrator.propose(input(transcript));
    assert.deepEqual(result, { proposals: [] });
  }
  assert.equal(ask.prompts.length, 0);
});

test("an aborted signal returns an error", async () => {
  const already = new AbortController();
  already.abort();
  const ask = scripted([JSON.stringify(threeProcesses)]);
  const orchestrator = createOrchestrator({ ask, knownSystems });
  const before = await orchestrator.propose({ ...input(threeTasks), signal: already.signal });
  assert.deepEqual(before, { error: "The reading was stopped." });
  assert.equal(ask.prompts.length, 0);

  const during = new AbortController();
  const slow: Ask = (_prompt, options) =>
    new Promise((_resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new Error("killed")), { once: true });
    });
  const pending = createOrchestrator({ ask: slow, knownSystems }).propose({
    ...input(threeTasks),
    signal: during.signal,
  });
  during.abort();
  assert.deepEqual(await pending, { error: "The reading was stopped." });
});

test("a failing ask returns one sentence", async () => {
  const failing: Ask = async () => {
    throw new Error("cursor-agent: command not found\nmore detail");
  };
  const result = await createOrchestrator({ ask: failing, knownSystems }).propose(input(threeTasks));
  assert.deepEqual(result, { error: "cursor-agent: command not found." });
});

test("missing or invalid known systems return an error", async () => {
  assert.match((parseKnownSystems(undefined) as { error: string }).error, /LAB_KNOWN_SYSTEMS is not set/);
  assert.match((parseKnownSystems("") as { error: string }).error, /LAB_KNOWN_SYSTEMS is not set/);
  assert.match((parseKnownSystems("not json") as { error: string }).error, /not valid JSON/);
  assert.match((parseKnownSystems("[]") as { error: string }).error, /at least one/);
  assert.match((parseKnownSystems('[{"name":"X","site":"not a host","kind":"website","loginNeeded":true}]') as { error: string }).error, /entry 1/);
  assert.match((parseKnownSystems('[{"name":"X","site":"x.example.com","kind":"api","loginNeeded":true}]') as { error: string }).error, /entry 1/);
  assert.deepEqual(parseKnownSystems('[{"name":"X","site":"https://X.example.com/path","kind":"website","loginNeeded":true}]'), [
    { name: "X", site: "x.example.com", kind: "website", loginNeeded: true },
  ]);

  const ask = scripted([JSON.stringify(threeProcesses)]);
  const orchestrator = createOrchestrator({ ask, knownSystems: () => parseKnownSystems(undefined) });
  const result = await orchestrator.propose(input(threeTasks));
  assert.ok("error" in result);
  assert.match(result.error, /LAB_KNOWN_SYSTEMS/);
  assert.equal(ask.prompts.length, 0);
});

function input(transcript: TranscriptTurn[]) {
  return {
    interviewId: "interview-1",
    transcript,
    language: "en",
    model: "auto",
    signal: new AbortController().signal,
  };
}

function scripted(answers: string[]): Ask & { prompts: string[] } {
  const queue = [...answers];
  const prompts: string[] = [];
  const ask: Ask = async (prompt) => {
    prompts.push(prompt);
    const next = queue.shift();
    if (next === undefined) throw new Error("The script has no more answers.");
    return next;
  };
  return Object.assign(ask, { prompts });
}

/** A copy of `validProposal` in `pipelines/read.ts`, which is not exported. */
function validProposal(proposal: ProcessProposal): boolean {
  if (!proposal.name?.trim() || !proposal.description?.trim() || !proposal.successCriterion?.trim()) {
    return false;
  }
  if (!Array.isArray(proposal.sites) || proposal.sites.length === 0) return false;
  for (const site of proposal.sites) {
    if (site.kind !== "website" && site.kind !== "connector") return false;
    const identity = siteIdentity(site.site, site.kind);
    if (!identity || !isSiteIdentity(identity, site.kind)) return false;
  }
  if (proposal.schedule.kind === "daily") {
    return /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(proposal.schedule.time);
  }
  if (proposal.schedule.kind === "every") {
    return (
      Number.isInteger(proposal.schedule.minutes) &&
      proposal.schedule.minutes >= SCHEDULE_MINUTES_MIN &&
      proposal.schedule.minutes <= SCHEDULE_MINUTES_MAX
    );
  }
  return false;
}
