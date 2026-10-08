import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { readCurrentShelfVersion } from "../shelf/validator.ts";
import type { ShelfEntry } from "./types.ts";

/** Every tool on the shelf at its current version. An unreadable tool is left out. */
export async function listShelf(shelfDir: string): Promise<ShelfEntry[]> {
  let names: string[];
  try {
    names = (await readdir(shelfDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
  const entries: ShelfEntry[] = [];
  for (const name of names) {
    try {
      const tool = await readCurrentShelfVersion(shelfDir, name);
      entries.push({ ...tool.meta, version: tool.version });
    } catch {
      // Not a tool folder.
    }
  }
  return entries;
}

/** The same list, kept to the tools that mention every word. */
export function searchShelf(entries: ShelfEntry[], words: string[]): ShelfEntry[] {
  const wanted = words.map((word) => word.toLowerCase()).filter(Boolean);
  return entries.filter((entry) => {
    const text = [
      entry.name.replaceAll("_", " "),
      entry.name,
      entry.description,
      ...entry.sites,
      ...entry.connectors,
      ...Object.entries(entry.input).flat(),
      ...Object.entries(entry.output).flat(),
    ]
      .join(" ")
      .toLowerCase();
    return wanted.every((word) => text.includes(word));
  });
}

/**
 * Standalone stand-in for the service's installer: copies a checked draft
 * unchanged into the next version folder. Used only by the terminal command.
 */
export async function installLocal(shelfDir: string, draftFolder: string, name: string): Promise<number> {
  let version = 1;
  try {
    version = (await readCurrentShelfVersion(shelfDir, name)).version + 1;
  } catch {
    // First version.
  }
  const target = path.join(shelfDir, name, `v${version}`);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(draftFolder, target, { recursive: true, errorOnExist: true, force: false });
  return version;
}
