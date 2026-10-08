# Interview and Orchestrator Specification

> Purpose: How a person’s spoken description of their work becomes a list of proposed processes. Part 5 of the product breakdown.

## Overview

The interview is a voice conversation with an ElevenLabs agent that asks the person how they do their work. The result is a transcript. The orchestrator is a single agent call that reads the finished transcript and proposes processes. It has one ability: to propose. It touches no site, creates no tool and starts no monster.

This part replaces the orchestrator stand-in in the lab service, and supplies the voice side of the web app’s Interview screen.

## Product Integration

- The web app’s Interview screen hosts the conversation and collects the turns. See `specs/web-app`.
- The lab service stores the interview, calls the orchestrator in the background, and turns its answer into proposed processes. See `specs/lab-service`.
- Proposed processes go to review and invitation before any monster starts.

## Interaction Design

The person presses one button and talks. The agent is curious and brief: one question at a time, no jargon, in the person’s own language. Long, rambling answers are welcome. When the person ends the conversation the transcript is on screen and the product says it is reading it. Within about a minute the proposed processes appear.

## The Interview Agent

Configured once in ElevenLabs. The web app joins it by its agent id, from `NEXT_PUBLIC_ELEVENLABS_AGENT_ID`. When that is not set, voice is shown as unavailable and typing still works.

**What it is told to do**:

1. Open by asking the person to describe one task they do regularly, start to finish.
2. For each task, find out: what starts it; which systems they open; what they read and what they type, field by field; how they know it worked; how long it takes; how often they do it.
3. Ask for the next task. Stop after three, or when the person has no more.
4. Never ask for a password. Never promise anything about what will be automated.
5. Close by reading back the tasks it heard in one sentence each.

It speaks the language the person uses. It has no tools.

**Typed path**: the same screen always shows a text box. Typed lines are added to the transcript as the person’s turns. With no voice connection the transcript is simply what was typed.

## The Orchestrator

One call to the Cursor command-line agent in its read-only mode, with the model from `LAB_MODEL`. It receives the transcript and the list of known systems, and must answer with one JSON document and nothing else.

**Known systems** come from configuration: a short list of names with their host names and whether each needs a login, for example the HR system, the bank and the mailbox connector. The orchestrator may only propose sites from this list.

**What it returns for each process**:

| Field         | Meaning                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| `name`        | A short name in the person’s words.                                                         |
| `description` | What the person does, step by step, including how long it takes and how often.              |
| `sites`       | The known systems it needs, each marked as a website or a connector.                        |
| `criterion`   | How the person knows it worked.                                                             |
| `schedule`    | Daily at a time, or every N minutes, as the person described. Daily at 08:00 when unsaid.   |
| `source`      | Where each piece of incoming work comes from, in one sentence.                              |

**Rules it is given**: one process per distinct task; keep the order the person described them in; at most five; do not invent steps the person did not say; a task that needs a system not on the known list is left out and named in a separate `skipped` list with one sentence each.

## User Flows

### Flow 1: Interview to proposals

**Steps**:

1. The person talks or types, then ends the interview. The web app saves the turns and language.
2. The lab service marks the interview as being read and calls the orchestrator.
3. The answer is checked: valid JSON, every field present, every site on the known list, a valid schedule.
4. Each process becomes a proposed process, in order. Skipped tasks are shown beneath them with their reason.

**Result**: The interview is `proposed`, or `nothing_found` when the list is empty.

**Error Handling**: An answer that fails the check is asked for once more, with the problem stated. A second failure, or no answer within five minutes, leaves the interview with a read error and one sentence for the user.

## Data Model

Nothing beyond the interview and process records in `specs/lab-service`. Skipped tasks are stored on the interview as text.

## Key Design Decisions

| Decision                                                    | Rationale                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| The orchestrator reads the finished transcript.             | One path for spoken and typed input, and no dependence on the voice agent calling us live.     |
| The interview agent has no tools.                           | Nothing the person says in conversation can cause an action.                                   |
| Sites come only from a known list.                          | A model must not invent an address that then appears on the invitation form.                   |
| The orchestrator only proposes.                             | The person reviews and invites before anything touches a system.                               |
| The interview asks how long and how often.                  | The saving is then the person’s own number.                                                    |
| The conversation is held in the person’s language.          | People describe their work best in the language they do it in.                                 |

## Invariants

1. The orchestrator changes nothing except the list of proposed processes for its interview.
2. A proposed process never names a site outside the known list.
3. No password is asked for or stored in a transcript.
4. Spoken and typed interviews follow the same path after the transcript is saved.

## Authors

Filip Zitny, with Claude.
