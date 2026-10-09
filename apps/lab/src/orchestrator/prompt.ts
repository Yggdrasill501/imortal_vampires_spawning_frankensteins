import type { TranscriptTurn } from "@repo/contract";
import type { KnownSystem } from "./known-systems.ts";

export const MAX_PROCESSES = 5;
export const DEFAULT_SCHEDULE = { kind: "daily", time: "08:00" } as const;

export interface PromptInput {
  transcript: readonly TranscriptTurn[];
  language: string;
  knownSystems: readonly KnownSystem[];
  /** Why the previous answer was rejected; set on the one retry. */
  problem?: string;
}

export function buildPrompt(input: PromptInput): string {
  const systems = input.knownSystems
    .map(
      (system) =>
        `- ${system.name}: site "${system.site}" (${system.kind}, ${system.loginNeeded ? "login needed" : "no login needed"})`,
    )
    .join("\n");
  const transcript = input.transcript
    .map((turn) => `${turn.speaker === "user" ? "Person" : "Interviewer"}: ${turn.text.trim()}`)
    .join("\n");

  const parts = [
    `You read the transcript of an interview in which a person described their daily work. Propose the processes a software agent could later learn to perform in a browser. You only propose: you touch no website, create nothing and start nothing.`,
    `Language reported for the interview: ${input.language}. This comes from the browser and can be wrong.`,
    `Known systems (the only sites you may name, written exactly as the "site" value):\n${systems}`,
    `Transcript:\n${transcript}`,
    `Rules:
- One process per distinct task the person described.
- Keep the order the person described them in.
- At most ${MAX_PROCESSES} processes.
- Do not invent steps the person did not say.
- Propose only sites from the known systems list. Every process needs at least one site.
- A task that needs a system not on the known list is not proposed; put it in "skipped" with one sentence saying why.
- The schedule is what the person said: {"kind":"daily","time":"HH:MM"} for every day at a time, or {"kind":"every","minutes":N} with N from 1 to 1440. When the person did not say, use {"kind":"daily","time":"${DEFAULT_SCHEDULE.time}"}.
- Write "name", "description", "successCriterion" and "source" in the language the person actually speaks in the transcript, whatever language was reported.
- "name" is short and in the person's words. "description" says what the person does, step by step, including how long it takes and how often when the person said so. "successCriterion" is how the person knows it worked. "source" is one sentence on where each piece of incoming work comes from.
- Answer with one JSON document and nothing else: no explanation, no code fence.`,
    `Answer format:
{
  "processes": [
    {
      "name": "string",
      "description": "string",
      "successCriterion": "string",
      "sites": ["one or more site values from the known systems"],
      "schedule": {"kind":"daily","time":"08:00"},
      "source": "string"
    }
  ],
  "skipped": [
    {"task": "string", "reason": "string"}
  ]
}`,
  ];
  if (input.problem) {
    parts.push(
      `Your previous answer was rejected for this reason: ${input.problem} Answer again with one corrected JSON document and nothing else.`,
    );
  }
  return parts.join("\n\n");
}
