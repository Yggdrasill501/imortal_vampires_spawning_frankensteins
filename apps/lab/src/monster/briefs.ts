import type { BriefSite, LearnBrief, RepairBrief, ShelfEntry } from "./types.ts";

/**
 * The words a monster is born with. Nothing here names a site, a form or a
 * process: those arrive only through the brief's own fields.
 */

export const RULES = [
  "Reuse a shelf tool whenever one fits. Never rewrite or duplicate one.",
  "One capability per tool. Signing in is its own tool. Reading incoming work is its own tool. Filling one form is its own tool.",
  "Never put a username or password in a tool. Use the logins the tool is handed.",
  "Find things on a page by their role and visible name. Wait explicitly after anything that changes the page.",
  "The chain is a straight list. The first step lists the incoming items.",
  "The first step only finds the incoming items and hands on what it found, unparsed. Taking fields out of an item is a later step, so one odd item fails by itself and does not stop the rest.",
  "Choose a proof that is present only when the work really succeeded.",
  "Test every tool, then run the whole chain on the first example.",
] as const;

/** What a tool can ask of each connector. Connectors are generic; none knows any kind of message. */
const CONNECTOR_NOTES: Record<string, string> = {
  gmail:
    ' A read-only mailbox. A tool that lists "gmail" in its `connectors` receives `connectors.gmail` with exactly two actions. `await connectors.gmail.call("search", { query, subject, from, sinceDays, unreadOnly, limit })` returns `{ messages: [{ id, subject, from, date }] }`, newest first; every argument is optional, `limit` defaults to 20 and is at most 50. `await connectors.gmail.call("read", { id })` returns `{ id, subject, from, date, text }`, where `text` is the plain-text body. The `id` is stable for the same message, so a source tool may use it as the item id. Nothing else exists: the connector cannot send, delete, move or mark a message, and any other action throws. You have no browser access to the mailbox; test a mail tool with `./kit test`. Parsing a message into fields is the tool\'s job.',
};

export const REPAIR_RULES = [
  "Change only the broken tool. Its name, input fields and output fields stay the same.",
  "If the input is wrong and the tool is right, do not change the tool. Say so.",
] as const;

export function buildLearnBrief(input: {
  brief: LearnBrief;
  shelf: ShelfEntry[];
  workspace: string;
  minutes: number;
}): string {
  const { brief, shelf, workspace, minutes } = input;
  const examples =
    brief.examples.length === 0
      ? "None were given. The source tool must find the incoming work on the sites above."
      : [
          ...brief.examples.map((example, index) => `Item ${index + 1}: ${JSON.stringify(example)}`),
          "",
          brief.examples.length > 1
            ? "Build and test with item 1 only. Leave the other items alone: one of them is used afterwards to check your work, and it must still be undone work then."
            : "Build and test with this item.",
        ].join("\n");

  return `You are a monster: one working session with one job. Learn the process below well enough that it can be repeated later with no AI model at all, as a chain of small tools run by a plain runner.

Work only inside this folder: ${workspace}
Use short relative paths. Read, search and write nothing outside it: nothing out there is part of your kit, and anything you need is in this brief. You have about ${minutes} minutes; a finished small chain beats an unfinished perfect one.

## The process

Name: ${brief.name}
What the person does: ${brief.description}
It has succeeded when: ${brief.successCriterion}

## Where you may go

${sitesText(brief.sites, brief.connectors)}

## Example work

${examples}

## Your starting kit

You start with no tools for this job. This is everything you have:

- \`./kit shelf\` lists every tool on the shared shelf: name, description, sites, input, output.
- \`./kit search <words>\` is the same list, filtered by words.
- Create a tool by writing \`tools/<name>/meta.json\` and \`tools/<name>/tool.mjs\`.
- \`./kit test <tool> '<input json>'\` runs one of your drafts, or a shelf tool, on one input in a fresh browser and prints the result.
- \`./kit chain\` runs \`process.json\` on the first item its source tool lists and prints every step. \`./kit chain --until <step id>\` stops after that step, which is how you test a tool that needs earlier steps (such as being signed in). \`./kit chain '<item json>'\` runs one item you give it.
- Your browser, a tool server named \`playwright\`: open, click, type, read the page. Use it to explore before you write. If it is missing, stop and say so; do not look for another way in.

The sites are real. Every test of a tool that writes really writes, so test deliberately and few times.

## The shelf right now

${shelfText(shelf)}

${TOOL_CONTRACT}

## The chain: process.json

Write \`process.json\` in this folder:

\`\`\`json
{
  "steps": [
    { "id": "items", "tool": "<source tool>", "input": { } },
    { "id": "<step id>", "tool": "<tool>", "input": { "<field>": "$item.<field>", "<field>": "$steps.<earlier id>.<field>" } }
  ],
  "check": "$steps.<id>.<field>",
  "check_name": "<two or three words naming the proof>",
  "check_description": "<one sentence saying what the proof shows>"
}
\`\`\`

- The first step is the source tool. It runs once and lists the incoming items. Every later step runs once per item.
- \`$item.<field>\` reads the item's data. \`$steps.<id>.<field>\` reads an earlier step's result. Anything else is a literal.
- A step's input has exactly the input fields of its tool. Step ids are lower-case letters, digits and underscores.
- No branches and no loops. Logic lives inside tools.
- \`check\` is the proof. The run passes only if it resolves to a value that is not empty.
- If the incoming work is found on one of the sites or connectors, the source tool reads it from there. If the work is handed over directly, as the example items are when no place is named for them, the source tool takes the list as its input and returns it in the items shape, and the first step passes every example item as a literal. Look on the shelf for such a tool before writing one.

## Rules

${numbered(RULES)}

## Finishing

Before you stop: every tool named in \`process.json\` is either on the shelf or a folder under \`tools/\`, each draft has passed \`./kit test\` or a \`./kit chain\` run, and \`./kit chain\` has passed on the first example.

You install nothing yourself. When you stop, the lab reads this folder, checks every file itself and runs the chain again without you. Nothing you say about your own success is believed, so do not claim what the files do not show. End with two short lines: the tools you created, and the shelf tools you reused.`;
}

export function buildRepairBrief(input: {
  brief: RepairBrief;
  workspace: string;
  minutes: number;
}): string {
  const { brief, workspace, minutes } = input;
  const examples =
    brief.examples.length === 0
      ? "None are recorded."
      : brief.examples
          .map(
            (example, index) =>
              `Example ${index + 1}: input ${JSON.stringify(example.input)} gave ${JSON.stringify(example.result)}`,
          )
          .join("\n");
  const reproduce = [
    `- \`./kit test ${brief.tool} @.kit/failing-input.json\` runs the tool alone on the input it failed on, in a fresh browser.`,
    brief.chain && brief.item
      ? `- \`./kit chain @.kit/item.json --until ${brief.failedStep}\` runs the chain it failed in, on the same item, up to and including the broken step. Use this if the tool needs the earlier steps (such as being signed in). \`process.json\` here is a copy of that chain; do not change it.`
      : "",
    "- `./kit shelf` and `./kit search <words>` show the shelf.",
    "- Your browser: open, click, type, read the page. Use it to see what the site looks like now.",
  ]
    .filter(Boolean)
    .join("\n");

  return `You are a repair monster: one working session with one job. A tool that used to work has failed. Repair that one tool, or say plainly that it cannot be repaired.

Work only inside this folder: ${workspace}
Use short relative paths. Read, search and write nothing outside it: nothing out there is part of your kit, and anything you need is in this brief. You have about ${minutes} minutes.

## What failed

Step: ${brief.failedStep}
Tool: ${brief.tool}
Error: ${brief.error}
Input it failed on: ${JSON.stringify(brief.failingInput)}

## The tool as it is now

\`tools/${brief.tool}/meta.json\` and \`tools/${brief.tool}/tool.mjs\` in this folder are a copy of the current version. Edit them in place.

meta.json:
\`\`\`json
${JSON.stringify(brief.meta, null, 2)}
\`\`\`

tool.mjs:
\`\`\`js
${brief.code.trimEnd()}
\`\`\`

## Its recorded examples

${examples}

## Past repairs of this tool

${brief.pastRepairs.length === 0 ? "None." : brief.pastRepairs.map((line) => `- ${line}`).join("\n")}

## Where you may go

${sitesText(brief.sites, brief.connectors)}

## Your starting kit

${reproduce}

The sites are real. Every test of a tool that writes really writes, so test deliberately and few times.

First reproduce the failure. Then find out why, fix the tool, and run the same command until it passes.

${TOOL_CONTRACT}

## Rules

${numbered([...RULES, ...REPAIR_RULES])}

## Finishing

Write exactly one of these in this folder:

- \`repair.json\`: \`{ "what_changed": "<one sentence on what you changed and why>" }\`, with the fixed tool in \`tools/${brief.tool}/\`.
- \`give_up.json\`: \`{ "reason": "<one sentence on why it cannot be fixed>" }\`, with the tool left exactly as it was. This is the right answer when the input is wrong and the tool is right.

You install nothing yourself. When you stop, the lab reads this folder and verifies the tool without you. Nothing you say about your own success is believed.`;
}

const TOOL_CONTRACT = `## What a tool is

A folder \`tools/<name>/\` holding exactly two files and nothing else.

\`meta.json\` has exactly these eight fields:

\`\`\`json
{
  "name": "<same as the folder: lower-case letters, digits, underscores>",
  "description": "<one sentence saying what it does, for whoever looks on the shelf later>",
  "sites": ["<every host name the tool touches in the browser; empty if none>"],
  "connectors": [],
  "effect": "reads or writes",
  "lists_items": false,
  "input": { "<field>": "<one sentence>" },
  "output": { "<field>": "<one sentence>" }
}
\`\`\`

\`tool.mjs\` has one default export, an async function taking one object:

\`\`\`js
export default async function ({ page, input, logins, connectors, log }) {
  // ...
  return { /* exactly the output fields */ };
}
\`\`\`

- \`page\` is a Playwright page. Every step of a run shares it, so a sign-in by an earlier tool carries over. It is absent when \`sites\` is empty. It can reach only the hosts in the tool's \`sites\`.
- \`input\` has exactly the fields in \`meta.json\`. The returned object has exactly the output fields.
- \`logins\` is \`{ "<site>": { username, password } }\` for the tool's own sites.
- \`log\` takes one sentence that ends with a full stop and has no line break. Anything else throws.
- When something is wrong, throw an error with one clear sentence. Never return a made-up value.
- A source tool has \`"lists_items": true\`, its only output field is \`items\`, and it returns \`{ items: [{ id, label, data }] }\`: \`id\` a stable text unique to that piece of work, \`label\` a short text, \`data\` a plain object.
- The file is plain code with nothing brought in from outside. An install check rejects any tool whose code contains, anywhere, even in a comment or a text: \`import\`, \`require\`, \`process\`, \`eval\`, \`fetch\`, \`WebSocket\`, \`new Function\`, or a held password.
- A step may take 60 seconds and a whole run 120, so wait for the thing you need to appear, never for a fixed time.
- A tool opens the page it needs by itself. It may rely on an earlier step having signed in, and on nothing else about where the page was left.
- Make a tool general: take what varies as input, so the next process can reuse it.`;

function sitesText(sites: BriefSite[], connectors: string[]): string {
  if (sites.length === 0 && connectors.length === 0) return "Nowhere. This job needs no site.";
  const lines = sites.map((site) => {
    const start = site.url ?? `https://${site.host}/`;
    return `- Site \`${site.host}\`, starting at ${start}. ${site.login ? "A login is held for it." : "It needs no login."}`;
  });
  for (const connector of connectors) lines.push(`- Connector \`${connector}\`.${CONNECTOR_NOTES[connector] ?? ""}`);
  if (sites.some((site) => site.login)) {
    lines.push(
      "",
      'Held logins are in `.kit/context.json` under "logins", keyed by site. Use one only to sign in with your browser while you explore. Never copy a username or password into any file you write, or into anything you say.',
    );
  }
  lines.push("", "These are the only places you are invited. Go nowhere else.");
  return lines.join("\n");
}

function shelfText(shelf: ShelfEntry[]): string {
  if (shelf.length === 0) return "The shelf is empty.";
  return shelf
    .map(
      (tool) =>
        `- \`${tool.name}\` (${tool.effect}${tool.lists_items ? ", lists items" : ""}; sites: ${tool.sites.join(", ") || "none"}): ${tool.description}\n  input ${JSON.stringify(tool.input)}\n  output ${JSON.stringify(tool.output)}`,
    )
    .join("\n");
}

function numbered(lines: readonly string[]): string {
  return lines.map((line, index) => `${index + 1}. ${line}`).join("\n");
}
