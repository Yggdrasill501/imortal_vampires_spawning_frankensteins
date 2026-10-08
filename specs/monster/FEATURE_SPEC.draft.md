# Monster Specification

> Purpose: How a monster learns a process and how it repairs a broken tool. Part 4 of the product breakdown, and the heart of the hackathon track.

## Overview

A monster is one session of a coding agent that owns one job: learn one process, or repair one tool. It is born with a starting kit that contains no task tools. It looks at the shelf, reuses what fits, creates what is missing, tests it, and hands the result to the lab service. The service then verifies everything itself; nothing the monster says about its own success is believed.

This part replaces the monster stand-in in the lab service.

## Product Integration

- The lab service calls a monster once per monster run and gives it hooks: read the shelf, record an action, report tokens, create a tool, take a tool into use, save a process, submit a repair. See `specs/lab-service`.
- Tools must match `specs/shelf-and-runner`. Access rules are in `specs/invitation`.
- The web app shows the monster’s actions live. See `specs/web-app`.
- Code lives in `apps/lab/src/monster`.

## The Brain

The monster is the Cursor command-line agent, run non-interactively with streamed JSON output. The model is one setting, `LAB_MODEL`, default `auto`. The agent is reached through one small interface (brief in; stream of events and a workspace of files out), so another agent can replace it by changing that one module.

Each monster run gets its own workspace folder, `.lab/workspaces/<monster run id>/`. The agent is told to work only there. Paths are kept short, and after the session the service checks that every expected file exists.

The agent is given a browser through the Playwright tool server, opened visibly on the user’s screen, with the process’s sites as its allowed origins.

The `CURSOR_API_KEY` variable is not passed to the agent unless `LAB_AGENT_USE_API_KEY=1`.

## The Starting Kit

Everything a monster can do at birth. None of it is specific to any task or site.

| Ability              | How                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------- |
| Read the shelf       | A command that lists every tool: name, description, sites, input, output.               |
| Search the shelf     | The same list filtered by words.                                                        |
| Create a tool        | Write `tools/<name>/meta.json` and `tools/<name>/tool.mjs` in its workspace.            |
| Test a tool          | A command that runs one draft or shelf tool on one input and prints the result.         |
| Run a chain          | A command that runs its draft chain on one item and prints the result.                  |
| Explore a site       | Generic browser actions: open, click, type, read the page.                              |

The kit is listed in the README. The team writes no task tools.

## User Flows

### Flow 1: Learning a process

**Entry Point**: The lab service starts a learn run for a queued process.

**The brief**: the process name, description and success criterion; its sites and connectors with their logins; the current shelf; two example items if the process has a source; and the rules below.

**Rules given to the monster**:

1. Reuse a shelf tool whenever one fits. Never rewrite or duplicate one.
2. One capability per tool. Signing in is its own tool. Reading incoming work is its own tool. Filling one form is its own tool.
3. Never put a username or password in a tool. Use the logins it is handed.
4. Find things on a page by their role and visible name. Wait explicitly after anything that changes the page.
5. The chain is a straight list. The first step lists the incoming items.
6. Choose a proof that is present only when the work really succeeded.
7. Test every tool, then run the whole chain on the first example.

**Steps**:

1. The monster reads the shelf and explores the sites.
2. It writes and tests its tools, then writes `process.json` (the chain and the proof) in its workspace.
3. The session ends. The service reads the workspace. For each new tool it calls the create-tool hook, which runs the install check. For each shelf tool named in the chain it calls take-into-use. Then it saves the process.
4. The service runs the saved chain on the second example with the runner.

**Result**: Verified, and the process awaits the seal; or failed, with one sentence saying why.

**Error Handling**: A missing file, a failed install check, a chain naming an unknown tool, a session that times out after 20 minutes, or a failed verification run each fail the monster run. Tools that passed the install check stay on the shelf and remain reusable.

### Flow 2: Repairing a tool

**Entry Point**: The lab service starts a repair run after a run failed at a tool.

**The brief**: the failed step, the first line of the error, the input it failed on, the tool’s current code and meta, its recorded examples, and past repair records for that tool.

**Rules, in addition to those above**:

1. Change only the broken tool. Its name, input fields and output fields stay the same.
2. If the input is wrong and the tool is right, do not change the tool. Say so.

**Steps**:

1. The monster reproduces the failure with the test command, explores if needed, and writes the fixed tool.
2. It writes `repair.json` with one sentence on what changed, or `give_up.json` with one sentence on why it cannot be fixed.
3. The service submits the new version as a candidate. A tool that only reads must reproduce its recorded examples and pass on the failed input. A tool that writes is verified by running the failed item again.

**Result**: The candidate becomes the current version and a verified repair record is saved; or the repair is recorded as not fixed and the process needs a human.

## The Live Action List

As the agent’s output streams in, each step becomes one plain sentence recorded through the action hook: opened a page, clicked a named thing, typed into a named field, created a tool, tested a tool and what happened. Passwords are replaced before storing. Token counts from the stream are reported as they arrive.

## Data Model

The monster stores nothing directly. Everything goes through the hooks. Its workspace holds drafts and is kept for inspection.

## Key Design Decisions

| Decision                                                        | Rationale                                                                                            |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A monster writes files; the service installs them.              | The service checks what actually exists. In testing, an agent reported success for a misplaced file. |
| Learning and repair are the same monster with a different brief. | One thing to build, and repair inherits the reuse rule for free.                                     |
| A repair may not change a tool’s inputs or outputs.             | Every process using the tool keeps working without being touched.                                    |
| The agent sits behind one small interface.                      | Build on the model the plan accepts now, switch for the final runs.                                  |
| A visible browser while exploring.                              | Watching it learn is the most memorable thing the product shows.                                     |
| “Cannot be fixed” is a first-class answer.                      | Bad input must not be papered over by changing a working tool.                                       |

## Invariants

1. A monster starts with no task tools, and the shelf is the only place it can find any.
2. A monster never installs, verifies or seals anything itself.
3. A monster never changes a tool it did not create, except the one tool it was sent to repair.
4. Every monster run ends as verified or failed, with tokens recorded.
5. No tool written by a monster contains a login.

**Stated limit**: the monster’s own session is a coding agent on the user’s machine and is not confined. See `specs/invitation`.

## Authors

Filip Zitny, with Claude.
