import { readFile } from "node:fs/promises";
import path from "node:path";
import { kitChain, kitShelf, kitTest } from "./kit.ts";

const usage = `The starting kit.
  ./kit shelf                               list every tool on the shelf
  ./kit search <words>                      the same list, filtered by words
  ./kit test <tool> '<input json>'          run one draft or shelf tool on one input, in a fresh browser
  ./kit chain ['<item json>'] [--until id]  run process.json on one item; with no item, the first one the source tool lists
JSON may also be given as @file.json.`;

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf("--workspace");
  if (at === -1 || !args[at + 1]) throw new Error(usage);
  const workspace = path.resolve(args[at + 1]!);
  args.splice(at, 2);
  const [command, ...rest] = args;

  let out: unknown;
  if (command === "shelf") {
    out = await kitShelf(workspace);
  } else if (command === "search") {
    out = await kitShelf(workspace, rest.flatMap((word) => word.split(/\s+/)));
  } else if (command === "test") {
    const [name, input] = rest;
    if (!name) throw new Error(usage);
    out = await kitTest(workspace, name, await json(workspace, input ?? "{}"));
  } else if (command === "chain") {
    const untilAt = rest.indexOf("--until");
    const until = untilAt === -1 ? undefined : rest[untilAt + 1];
    if (untilAt !== -1) rest.splice(untilAt, 2);
    out = await kitChain(workspace, {
      item: rest[0] === undefined ? undefined : await json(workspace, rest[0]),
      until,
    });
  } else {
    throw new Error(usage);
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

async function json(workspace: string, text: string): Promise<unknown> {
  const source = text.startsWith("@")
    ? await readFile(path.resolve(workspace, text.slice(1)), "utf8")
    : text;
  try {
    return JSON.parse(source) as unknown;
  } catch {
    throw new Error("That is not valid JSON. Quote it in single quotes, or pass @file.json.");
  }
}

main().catch((error) => {
  process.stdout.write(
    `${JSON.stringify({ status: "failed", error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`,
  );
  process.exitCode = 1;
});
