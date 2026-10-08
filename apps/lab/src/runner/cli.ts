import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Runner } from "./runner.ts";

const usage = `Usage:
  pnpm --filter @repo/lab runner fixture --url <page URL> [--allow <host>]

The fixture is outside the shelf. It opens one page and returns its title.
Use --allow to deliberately prove that an uninvited page is refused.`;

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command !== "fixture") throw new Error(usage);
  const url = readFlag(args, "--url");
  if (!url) throw new Error(usage);
  const target = new URL(url);
  const allowedHost = readFlag(args, "--allow") ?? target.hostname;
  const fixtureDir = fileURLToPath(new URL("../../fixtures/page-title/", import.meta.url));
  await access(path.join(fixtureDir, "tool.mjs"));

  // The fixture is intentionally outside the shelf. Its host is supplied only
  // for this proof run, so no product tool knows about OrangeHRM or any other site.
  const runner = new Runner({ shelfDir: path.resolve("shelf") });
  const result = await runner.runFixture({
    folder: fixtureDir,
    targetUrl: target.toString(),
    allowedHost,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
