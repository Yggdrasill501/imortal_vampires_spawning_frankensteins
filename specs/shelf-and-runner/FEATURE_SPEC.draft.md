# Shelf, Tool Contract and Runner Specification

> Purpose: What a tool is, how it is checked before it joins the shelf, and how a saved chain of tools is executed with no AI model. Part 2 of the product breakdown.

## Overview

A tool is a small file of code with one capability, written by a monster. The shelf is the folder of all tool versions. The runner executes tools: it lists incoming items, runs a chain for one item, and replays one tool on one recorded input. The runner contains no model and never asks one for help.

This part replaces two stand-ins in the lab service: the install check and the runner. It is built first as a standalone piece that can be run from the command line, then plugged into the service.

## Product Integration

- The lab service calls this part through the shelf seam (install check) and the runner seam (list items, run one item, replay one tool). See `specs/lab-service`.
- The invitation rules it enforces are defined in `specs/invitation`.
- Monsters write tools in exactly the shape defined here. See `specs/monster`.
- Code lives in the lab service package (`apps/lab/src/runner`, `apps/lab/src/shelf`).

## Interaction Design

The user sees the runner work in two ways: a real browser window that opens on their screen and performs the steps, and the run record in the web app. The browser window is visible by default; `LAB_HEADLESS=1` hides it.

## Terminology

| Term        | DB/Code       | Definition                                                                   |
| ----------- | ------------- | ---------------------------------------------------------------------------- |
| Tool        | `tool`        | One capability: a `meta.json` and a `tool.mjs` in a version folder.          |
| Source tool | `lists_items` | A tool whose job is to return incoming items. Always the first step.         |
| Chain       | `steps`       | The ordered list of steps a process runs for one item.                       |
| Reference   | `$item`, `$steps` | A value taken from the item or from an earlier step’s result.            |
| Proof       | `check`       | A reference that must resolve to a non-empty value for the run to pass.      |

## Tool Contract

A version folder is `shelf/<tool_name>/v<n>/` and holds exactly two files.

**`meta.json`**

| Field         | Type                | Meaning                                                            |
| ------------- | ------------------- | ------------------------------------------------------------------ |
| `name`        | string              | Same as the folder name. Lower-case letters, digits, underscore.   |
| `description` | string              | One sentence saying what it does.                                  |
| `sites`       | string[]            | Host names the tool touches in the browser. Empty for none.        |
| `connectors`  | string[]            | Connectors it calls, for example `gmail`. Empty for none.          |
| `effect`      | `reads` \| `writes` | Whether it changes anything outside itself.                        |
| `lists_items` | boolean             | True only for a source tool.                                       |
| `input`       | object              | Field name to one-sentence meaning.                                |
| `output`      | object              | Field name to one-sentence meaning.                                |

**`tool.mjs`**

One default export: an async function that receives one object and returns one plain object.

| Handed to the tool | What it is                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `page`             | The run’s browser page, shared by every step so a login carries over. Absent when `sites` is empty. |
| `input`            | The resolved input for this step.                                                            |
| `logins`           | `{ [site]: { username, password } }` for the sites the tool declares, and no others.         |
| `connectors`       | `{ [name]: { call(action, args) } }` for the connectors the tool declares, and no others.    |
| `log`              | A function taking one sentence, shown in the run record.                                     |

Rules for the code: no imports, no `require`, no access to the process, files or network except through what it is handed. It throws an error with a clear sentence when something is wrong, and never returns made-up values. A source tool returns `{ items: [{ id, label, data }] }`, where `id` is stable for the same piece of work.

## Chain Format

```
steps: [ { id, tool, input: { field: reference or literal } } ]
check: reference
```

- `$item.<field>` reads the item’s `data`. `$steps.<id>.<field>` reads an earlier step’s result. Anything else is a literal.
- The chain is a straight list: no branches and no loops. Repetition lives in items; logic lives inside tools.
- The first step of a process’s chain is its source tool. It runs once per tick to list items. The remaining steps run once per item.
- A step uses the tool’s current version. The run records the exact version it used.

## User Flows

### Flow 1: Install check

**Entry Point**: The lab service asks whether one version folder may join the shelf.

**Steps**:

1. Both files exist; `meta.json` parses and every field is present and well formed; `name` matches the folder.
2. Every site and connector in `meta.json` is in the invitation.
3. The code contains none of: an import, `require`, `process`, `eval`, `new Function`, `fetch`, a web socket, or any held password.
4. The code is under 20,000 characters and exports a default function.

**Result**: Passed, or failed with one sentence per problem. A failed version never becomes current.

This check is not a sandbox. It is a cheap filter in front of the real boundary, which is the runner’s browser guard.

### Flow 2: List items

**Steps**: The runner loads the source tool, runs it once, and returns its items. The lab service skips items already handled.

**Error Handling**: A failure is reported as a failed lookup with the tool, the stage and the first line of the error.

### Flow 3: Run one item

**Steps**:

1. For each step: the install check is repeated, the tool is loaded, its sites are confirmed to be within the process’s sites, its input is resolved, and it is run.
2. The browser opens on the first step that declares a site and stays open until the run ends.
3. After the last step, the proof is resolved. A missing or empty proof fails the run.

**Result**: `passed`, `failed` or `refused`, with every step’s tool, version, duration and result, the proof value, any refusals, and a model-call count of 0.

**Error Handling**: The run stops at the first failure and reports the step, the stage (`install`, `resolve`, `tool` or `check`) and the first line of the error. A step is given 60 seconds; the whole run 120 seconds.

### Flow 4: Replay one tool

**Steps**: The runner runs a single tool version on one recorded input and returns its result. Used to verify a repaired tool that only reads.

## Data Model

The runner stores nothing itself. It returns results to the lab service, which records them. On disk it reads the shelf and nothing else.

## Key Design Decisions

| Decision                                                        | Rationale                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A tool is two small files and one function.                     | Easy for a monster to write, for the service to check and for a person to read.             |
| Tools receive capabilities; they do not reach for them.         | What a tool can touch is decided by what it is handed.                                      |
| One browser page for the whole run.                             | A login tool can be its own reusable tool.                                                  |
| Each runner operation runs in its own child process.            | A hung or crashing tool cannot take the service down, and a timeout can kill it.            |
| The source tool defines the items.                              | “What counts as new work” is part of what the monster learned, not built into the product.  |
| A visible browser by default.                                   | The user watches the work happen, and it films well.                                        |
| Built standalone first, with a command-line entry.              | It needs no model and no service, so it can be proven on the first hour.                    |

## First Build Step

A hand-written fixture tool that opens the OrangeHRM login page, kept in the test folder and never on the shelf. Done means: the visible browser opens the invited page and returns its title; the run reports 0 model calls; the same fixture pointed at `google.com` is refused and the refusal is reported.

## Invariants

1. The runner never calls an AI model.
2. A tool is handed only the sites, logins and connectors it declares.
3. A tool’s sites are always within its process’s sites, and those within the invitation.
4. A run stops at the first failure and never continues past it.
5. No team-written tool is ever placed on the shelf.

## Authors

Filip Zitny, with Claude.
