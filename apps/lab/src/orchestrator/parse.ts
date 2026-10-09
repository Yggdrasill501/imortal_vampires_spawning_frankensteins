import { SCHEDULE_MINUTES_MAX, SCHEDULE_MINUTES_MIN, type Schedule } from "@repo/contract";
import type { ProcessProposal } from "../seams/types.ts";
import { findKnownSystem, type KnownSystem } from "./known-systems.ts";
import { DEFAULT_SCHEDULE, MAX_PROCESSES } from "./prompt.ts";

/** A task the person described that no known system covers. */
export interface SkippedTask {
  task: string;
  reason: string;
}

export interface Reading {
  proposals: ProcessProposal[];
  skipped: SkippedTask[];
}

export type Checked = { ok: true; reading: Reading } | { ok: false; problem: string };

const DAILY_TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

/** Finds the one JSON document in the model's text, even inside a code fence or a sentence. */
export function extractJson(text: string): unknown {
  const candidates: string[] = [text.trim()];
  for (const match of text.matchAll(/```(?:json|JSON)?\s*([\s\S]*?)```/g)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next form.
    }
  }
  return undefined;
}

/** Checks the model's answer and turns it into proposals. Everything about a site comes from the known list. */
export function checkAnswer(text: string, knownSystems: readonly KnownSystem[]): Checked {
  const answer = extractJson(text);
  if (answer === undefined) return { ok: false, problem: "The answer was not one JSON document." };
  const root = Array.isArray(answer) ? { processes: answer } : answer;
  if (!isRecord(root)) return { ok: false, problem: "The answer must be a JSON object with a \"processes\" list." };
  const processes = root.processes ?? root.proposals;
  if (!Array.isArray(processes)) return { ok: false, problem: "The answer has no \"processes\" list." };
  if (processes.length > MAX_PROCESSES) {
    return { ok: false, problem: `The answer has ${processes.length} processes; at most ${MAX_PROCESSES} are allowed.` };
  }

  const proposals: ProcessProposal[] = [];
  for (const [index, entry] of processes.entries()) {
    const checked = checkProcess(entry, index + 1, knownSystems);
    if ("problem" in checked) return { ok: false, problem: checked.problem };
    proposals.push(checked.proposal);
  }
  return { ok: true, reading: { proposals, skipped: readSkipped(root.skipped) } };
}

function checkProcess(
  entry: unknown,
  position: number,
  knownSystems: readonly KnownSystem[],
): { proposal: ProcessProposal } | { problem: string } {
  const label = `Process ${position}`;
  if (!isRecord(entry)) return { problem: `${label} is not a JSON object.` };
  const name = nonEmpty(entry.name);
  if (!name) return { problem: `${label} is missing "name".` };
  const description = nonEmpty(entry.description);
  if (!description) return { problem: `${label} ("${name}") is missing "description".` };
  const successCriterion = nonEmpty(entry.successCriterion) ?? nonEmpty(entry.criterion);
  if (!successCriterion) return { problem: `${label} ("${name}") is missing "successCriterion".` };

  const rawSites = Array.isArray(entry.sites) ? entry.sites : typeof entry.sites === "string" ? [entry.sites] : [];
  if (rawSites.length === 0) return { problem: `${label} ("${name}") names no site; every process needs at least one site from the known list.` };
  const sites: ProcessProposal["sites"] = [];
  for (const rawSite of rawSites) {
    const value = typeof rawSite === "string" ? rawSite : isRecord(rawSite) ? nonEmpty(rawSite.site) ?? nonEmpty(rawSite.name) : null;
    const system = value ? findKnownSystem(value, knownSystems) : null;
    if (!system) {
      return {
        problem: `${label} ("${name}") names a site that is not on the known list: ${value ?? JSON.stringify(rawSite)}. Use only the site values given, or put the task in "skipped".`,
      };
    }
    if (!sites.some((site) => site.site === system.site && site.kind === system.kind)) {
      sites.push({ site: system.site, kind: system.kind, loginNeeded: system.loginNeeded });
    }
  }

  const schedule = checkSchedule(entry.schedule);
  if (!schedule) {
    return {
      problem: `${label} ("${name}") has an invalid schedule; use {"kind":"daily","time":"HH:MM"} or {"kind":"every","minutes":N} with N from ${SCHEDULE_MINUTES_MIN} to ${SCHEDULE_MINUTES_MAX}.`,
    };
  }

  const source = nonEmpty(entry.source);
  return {
    proposal: {
      name,
      description: source && !description.includes(source) ? `${description} ${source}` : description,
      successCriterion,
      sites,
      schedule,
    },
  };
}

/** An absent schedule is the default; a present one must be valid. */
function checkSchedule(raw: unknown): Schedule | null {
  if (raw === undefined || raw === null) return { ...DEFAULT_SCHEDULE };
  if (!isRecord(raw)) return null;
  if (raw.kind === "daily") {
    const time = typeof raw.time === "string" ? raw.time.trim() : "";
    return DAILY_TIME.test(time) ? { kind: "daily", time } : null;
  }
  if (raw.kind === "every") {
    const minutes = typeof raw.minutes === "string" ? Number(raw.minutes) : raw.minutes;
    return typeof minutes === "number" &&
      Number.isInteger(minutes) &&
      minutes >= SCHEDULE_MINUTES_MIN &&
      minutes <= SCHEDULE_MINUTES_MAX
      ? { kind: "every", minutes }
      : null;
  }
  return null;
}

function readSkipped(raw: unknown): SkippedTask[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (typeof entry === "string") return entry.trim() ? [{ task: entry.trim(), reason: "" }] : [];
    if (!isRecord(entry)) return [];
    const task = nonEmpty(entry.task) ?? nonEmpty(entry.name) ?? "";
    const reason = nonEmpty(entry.reason) ?? "";
    return task || reason ? [{ task: task || reason, reason }] : [];
  });
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
