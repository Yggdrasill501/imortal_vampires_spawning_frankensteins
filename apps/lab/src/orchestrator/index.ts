import type { TranscriptTurn } from "@repo/contract";
import type { OrchestratorSeam, StopSignal } from "../seams/types.ts";
import { askCursorAgent, STOPPED, type Ask } from "./ask.ts";
import { KNOWN_SYSTEMS_VARIABLE, parseKnownSystems, type KnownSystem } from "./known-systems.ts";
import { checkAnswer, type Reading } from "./parse.ts";
import { buildPrompt } from "./prompt.ts";

export type { Ask, AskOptions } from "./ask.ts";
export { parseKnownSystems, type KnownSystem } from "./known-systems.ts";
export type { Reading, SkippedTask } from "./parse.ts";

export interface OrchestratorDeps {
  ask: Ask;
  /** The configured systems, or how to read them when the interview is read. */
  knownSystems: readonly KnownSystem[] | (() => readonly KnownSystem[] | { error: string });
  /** The environment the agent starts with. The caller decides what goes in it. */
  env?: NodeJS.ProcessEnv | (() => NodeJS.ProcessEnv);
}

export interface ReadInput {
  transcript: readonly TranscriptTurn[];
  language: string;
  model: string;
  signal: StopSignal;
}

export interface Orchestrator extends OrchestratorSeam {
  /** The seam's `propose`, plus the skipped tasks the seam cannot carry yet. */
  read(input: ReadInput): Promise<Reading | { error: string }>;
}

export function createOrchestrator(deps: OrchestratorDeps): Orchestrator {
  const knownSystems = () => (typeof deps.knownSystems === "function" ? deps.knownSystems() : deps.knownSystems);
  const env = () => (typeof deps.env === "function" ? deps.env() : deps.env ?? minimalEnvironment());

  const read = async (input: ReadInput): Promise<Reading | { error: string }> => {
    const systems = knownSystems();
    if ("error" in systems) return { error: systems.error };
    if (input.signal.aborted) return { error: STOPPED };
    const transcript = input.transcript.filter((turn) => turn.text.trim());
    if (!transcript.some((turn) => turn.speaker === "user")) return { proposals: [], skipped: [] };

    let problem: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = buildPrompt({ transcript, language: input.language, knownSystems: systems, problem });
      let text: string;
      try {
        text = await deps.ask(prompt, { model: input.model, env: env(), signal: input.signal });
      } catch (error) {
        if (input.signal.aborted) return { error: STOPPED };
        return { error: oneSentence(error instanceof Error ? error.message : "The model did not answer.") };
      }
      if (input.signal.aborted) return { error: STOPPED };
      const checked = checkAnswer(text, systems);
      if (checked.ok) return checked.reading;
      problem = checked.problem;
    }
    return { error: `The model's answer could not be used after two attempts: ${problem}` };
  };

  return {
    read,
    async propose(input) {
      const reading = await read(input);
      if ("error" in reading) return reading;
      return { proposals: reading.proposals };
    },
  };
}

/** Enough for the agent to start. No key: the service's `agentEnvironment` adds one when configured. */
function minimalEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" };
  if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
  return env;
}

function oneSentence(text: string): string {
  const line = text.split(/\r?\n/).find((part) => part.trim())?.trim() ?? "The model did not answer.";
  return /[.!?]$/.test(line) ? line : `${line}.`;
}

/** The real orchestrator: the Cursor agent, with the systems from `LAB_KNOWN_SYSTEMS` read at each call. */
export const orchestrator: OrchestratorSeam = createOrchestrator({
  ask: askCursorAgent,
  knownSystems: () => parseKnownSystems(process.env[KNOWN_SYSTEMS_VARIABLE]),
});
