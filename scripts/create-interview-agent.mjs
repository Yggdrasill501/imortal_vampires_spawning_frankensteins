#!/usr/bin/env node
// Creates the ElevenLabs agent that conducts the voice interview, and prints
// its id. Put the id in .env as NEXT_PUBLIC_ELEVENLABS_AGENT_ID.
//
//   node scripts/create-interview-agent.mjs            create a new agent
//   node scripts/create-interview-agent.mjs <agent id> update that agent
//
// Needs ELEVENLABS_TOKEN in .env. The agent has no tools: nothing said in the
// conversation can cause an action. See specs/interview-and-orchestrator.
import { existsSync } from "node:fs";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const token = process.env.ELEVENLABS_TOKEN;
if (!token) {
  console.error("ELEVENLABS_TOKEN is not set in .env.");
  process.exit(1);
}

const FIRST_MESSAGE =
  "Good evening. Tell me about one task you do regularly, from start to finish.";

const PROMPT = `You interview one person about the routine work they do on a computer. Your only job is to get a clear description of each task. You have no tools and you take no action.

How to speak:
- Be curious and brief. One question at a time. No jargon.
- Let the person ramble. Long answers are welcome. Never interrupt to summarise.
- Keep each of your turns to one or two short sentences.

For each task, find out, asking only for what the person has not already said:
1. What starts it: an email, a time of day, a request.
2. Which systems they open.
3. What they read and what they type, field by field.
4. How they know it worked.
5. How long it takes, and how often they do it.

Then ask for the next task. Stop after three tasks, or when the person has no more.

Rules:
- Never ask for a password or any login. If the person starts to say one, stop them.
- Never promise that anything will be automated, and never say what will happen next.
- Do not suggest improvements or give advice.

To close, read back each task you heard in one sentence, ask if that is right, then say goodbye and tell the person they can end the interview.`;

const body = {
  name: "Night interview",
  conversation_config: {
    agent: {
      first_message: FIRST_MESSAGE,
      language: "en",
      prompt: { prompt: PROMPT },
    },
  },
};

const agentId = process.argv[2];
const url = agentId
  ? `https://api.elevenlabs.io/v1/convai/agents/${agentId}`
  : "https://api.elevenlabs.io/v1/convai/agents/create";

const response = await fetch(url, {
  method: agentId ? "PATCH" : "POST",
  headers: { "xi-api-key": token, "content-type": "application/json" },
  body: JSON.stringify(body),
});
const text = await response.text();
if (!response.ok) {
  console.error(`ElevenLabs answered ${response.status}: ${text.slice(0, 300)}`);
  process.exit(1);
}
const result = JSON.parse(text);
console.log(result.agent_id ?? agentId);
