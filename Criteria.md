# Criteria: what we claim and how each claim is proven

Each section gives the criterion, our status, one concrete example, and the way to check it yourself.

Three kinds of evidence are used. They are not equally strong, so each claim says which one it rests on.

| Kind | What it is | Where |
| --- | --- | --- |
| **Recorded run** | Three real monster sessions against a live OrangeHRM instance, on 9 October between 01:48 and 02:18. They were run through the monster's command-line entry point, before the lab service was connected and before the sandbox existed. | `evidence/*.log` (host name masked, otherwise unedited) |
| **Automated test** | 54 tests in the lab service. | `pnpm --filter @repo/lab test` |
| **Live demo** | The same flow through the web app and the lab service. | The video; `pnpm dev:all` |

What is **not** proven yet is listed at the end. Read that section before trusting the rest.

## The four hard rules

### 1. Generated code runs in a sandbox, never on a host holding credentials

**Status: partly met.**

Every tool a monster writes runs in a separate worker process, and that process is started inside the macOS system sandbox. This holds for the monster's own tests, the lab's check, every scheduled run and every rerun after a repair, because they all go through one launch point: `runWorker` in `apps/lab/src/runner/runner.ts`, which calls `sandboxed(...)` from `apps/lab/src/runner/sandbox.ts`.

The sandbox profile denies the tool:

- reading the project's `.env` files, where every key is kept;
- reading the lab's held logins (`.lab/logins.json`) and the logins handed to a monster (`.kit/context.json`);
- reading the usual credential folders and shell files in the home directory;
- writing anywhere in the home directory or the repository, except scratch space and the browser cache.

A tool receives only its input, the login for the sites it declared, and the connectors it declared.

**Example (automated test).** `apps/lab/src/runner/sandbox.test.ts`, "generated code cannot read the project's keys or the held logins": a process is started the way a tool is started, then tries to read a `.env` file, the held logins and a monster's stored logins, and to write a file into the home directory. All four are denied.

**Example (checked by hand, 9 October, about 04:15).** A tool run through the sandboxed worker opened the OrangeHRM login page in a browser and returned its title: status `passed`, 0 model calls. The same tool pointed at an uninvited page (google.com) was refused.

**Not met.** It is the same machine, not a container or a remote sandbox. The profile is a deny-list, so a secret in a place we did not list is readable. It exists on macOS only; on other systems the worker is an ordinary process. The monster's own agent session, which writes the code, is not sandboxed.

### 2. No install without passing tests; the test run is visible in the log

**Status: met, with one detail.**

There are three gates, in order:

1. **The monster's own tests.** It tests each tool and runs the draft chain before handing anything in.
2. **The install check** (`apps/lab/src/shelf/validator.ts`). A static check that rejects a tool which imports a module, names a site outside the invitation, or contains a held password.
3. **The lab's own run.** The lab runs the whole saved chain on a second example the monster did not build against, with no model. If it fails, every tool that monster created is taken off the shelf again (`withdrawCreatedTools` in `apps/lab/src/store/shelf-index.ts`).

The detail: a tool is placed on the shelf after gate 2 so that the lab can run it for gate 3. It cannot be used by a sealed process until gate 3 passes, and it is removed if gate 3 fails.

**Example (recorded run, `evidence/learn-add.log`).** The tests are in the log, including the ones that failed:

```
  - Tested handed_items: it passed.
  - Tested sign_in_orangehrm: it passed.
  - Ran the chain up to add: it passed.
  - Ran the chain up to job: it passed.
  - Ran the chain: it failed. tool: locator.waitFor: Timeout 30000ms exceeded.
  - Changed the tool find_employee_in_list.
  - Ran the chain: it passed.
  ...
Run of "Mina Zztesttwo": passed, 0 model calls.
  passed  sign_in_orangehrm v1 (6s)
  passed  add_employee v1 (9s)
  passed  set_job_title v1 (5s)
  passed  find_employee_in_list v1 (3s)
  proof: Mina Zztesttwo · Grave Keeper
Result: VERIFIED. The saved chain ran on the second example with 0 model calls.
```

The monster built against "Igor Zztestone". The lab checked on "Mina Zztesttwo".

**Example of the gate saying no (recorded run, `evidence/learn-end.log`).** The second monster was given one example only. Its chain passed its own tests, and the lab still refused it: `Result: NOT VERIFIED. There was no second example to check the work on.` We left this failure in.

**Example (automated tests).** `validator.test.ts`: "install check rejects imports and an uninvited site", "install check rejects a held password in the code". `service.test.ts`: "a learned process is checked by the lab, sealed, and run with no model".

**Where to see it in the product.** The process page lists the check lines and the lab's run, step by step.

### 3. The gap comes from a task

**Status: met.**

Tasks come from the interview. A monster is given the task in the person's words, the invited sites and the starting kit. Nothing in the product code names a tool to build, a site, or a process.

**Example (recorded run, `evidence/learn-add.log`).** The first lines show the monster finding the gap itself: it looks at the shelf, finds nothing, explores the site by hand, then writes the tools.

```
  - Looked at the shelf.
  - Opened https://<hr-host>/.
  - Read the page.
  - Filled in 2 fields.
  - Clicked Login button.
  - Clicked PIM link.
  - Clicked Add Employee link.
  ...
  - Searched the shelf for items.
  - Wrote the tool handed_items.
  - Wrote the tool sign_in_orangehrm.
```

**How to check.** The shelf folder is not in the repository (`/shelf/` is in `.gitignore`), so no tool can have been shipped with it. Open the Reliquary page before the first run: it is empty. Search the source for a site name: `grep -ril orangehrm apps packages` finds it in four places, none of them code that runs for a task: a sentence in a test's transcript, the simulated demo data of the web app, a usage example in `apps/lab/README.md`, and a comment in the runner's command-line entry point.

### 4. Self-iterations and spend per run are capped in code

**Status: partly met.**

| Cap | Default | Setting | Where enforced |
| --- | --- | --- | --- |
| Time per monster | 20 minutes | `LAB_MONSTER_TIMEOUT_MS` | `apps/lab/src/monster/monster.ts` |
| Learn attempts per process | 3 | `LAB_MAX_ATTEMPTS` | `apps/lab/src/routes/processes.ts` |
| Repairs per process | 3 | `LAB_MAX_ATTEMPTS` | `apps/lab/src/pipelines/run.ts` |
| Monsters at once | 3 | `LAB_MAX_MONSTERS` | the lab's queue |
| Time per chain run | 120 seconds | `LAB_RUN_TIMEOUT_MS` | the runner |
| Time to read an interview | 5 minutes | `LAB_READ_TIMEOUT_MS` | the orchestrator |

After the last allowed repair the process stops and is marked "needs a human".

**Example of spend (recorded runs).** Each session reports its cost when it ends:

| Session | Took | Tokens in | Tokens out |
| --- | --- | --- | --- |
| Learn "Add an employee" (5 tools) | 6m 3s | 58,017 | 14,336 |
| Learn "End an employment" (2 new, 2 reused) | 17m 30s | 85,124 | 30,156 |
| Repair `set_job_title` | 2m 11s | 32,983 | 2,298 |

Every run after sealing costs 0 model calls.

**Not met.** Tokens are recorded, not limited. The agent reports them only when a session ends, so the only spend limit in force during a session is the time limit.

## The definition of done

### A task exposes a missing capability; the agent creates, tests and registers it, then completes the task

**Status: met (recorded run).** `evidence/learn-add.log`: from an empty shelf the monster created five tools, tested them, registered them, and the task was completed on a second person with no model:

```
Tools created: handed_items, sign_in_orangehrm, add_employee, set_job_title, find_employee_in_list
Tools reused: none
Chain: items (handed_items) -> sign_in (sign_in_orangehrm) -> add (add_employee) -> job (set_job_title) -> verify (find_employee_in_list)
```

### A fresh session, on a different task, combines earlier capabilities without rebuilding

**Status: met (recorded run).** `evidence/learn-end.log`: a new session with no memory of the first, given a different task (end an employment), searched the shelf and took two tools the first monster had made:

```
  - Looked at the shelf.
  - Searched the shelf for end terminat employee job.
  ...
Tools created: find_employee_number, terminate_employment
Tools reused: handed_items, sign_in_orangehrm
Chain: items (handed_items) -> sign_in (sign_in_orangehrm) -> find (find_employee_number) -> end (terminate_employment)
```

It did not write a second sign-in tool.

### A persistent registry with versions and rollback

**Status: partly met.** Every tool is kept as `shelf/<name>/v<n>/` with a description and an interface, and recorded in Postgres (`tool`, `tool_version`). A repair adds a version and never overwrites one.

**Example (recorded run, `evidence/repair-job.log`).** A sealed chain failed with no model involved; a repair monster wrote version 2; the lab reran the failed item:

```
Run of "Renfield Zzbroken": failed, 0 model calls.
  passed  sign_in_orangehrm v1 (6s)
  passed  add_employee v1 (8s)
  failed  set_job_title v1 (33s)  tool: locator.click: Timeout 30000ms exceeded.
...
What changed: The save control is labeled Save, so the tool now clicks that button instead of the missing Confirm changes label.
Installed set_job_title v2 on the shelf as the candidate.
Run of "Renfield Zzbroken": passed, 0 model calls.
  passed  set_job_title v2 (4s)
Result: FIXED. The failed item was run again with 0 model calls.
```

The whole change between the two versions is one line: the button name `'Confirm changes'` became `'Save'`.

**How the break was made.** We broke it on purpose: we changed one button name in the installed version 1, to stand in for a site that renamed a button. The repair is the monster's own work. We did not have a real site change to show.

**Rollback.** Automatic only: a candidate version that fails its rerun is removed and the earlier version stays current. There is no button to roll back by hand.

### The agent builds or extends tooling for discovering and managing capabilities

**Status: not met.** The monster writes each tool's name, description, sites, input and output, and the shelf search reads exactly those words, so what can be found is decided by the agent. The shelf itself and its search (`./kit shelf`, `./kit search`) were written by us and are part of the starting kit.

### An approval gate and operator control

**Status: met.** Nothing runs on a schedule until a person seals it. The person chooses which sites are invited, sets the schedule, and can resume or retire a process. A tool that reaches for a site outside the invitation is stopped and listed on the Refused page.

**Example (automated tests).** `runner.test.ts`: "refuses a tool whose site is outside the process". `service.test.ts`: "start refuses a missing login, then queues one monster run per process". `gmail.test.ts`: "the connector code has no path that writes to the mailbox".

### Eyes, hands or a voice

**Status: met.** Hands and eyes: each monster drives a visible browser. Voice: the interview is a spoken conversation with an ElevenLabs agent that has no tools, so nothing said in it can cause an action (`scripts/create-interview-agent.mjs`).

## Out of bounds

| Forbidden | Our answer |
| --- | --- |
| Tools pre-written by the team | None. The shelf is not in the repository and starts empty. The starting kit (README, "Starting kit list") has six generic abilities and nothing about any site. |
| "Generated" code the team wrote or seeded | None. The one hand edit to generated code is the planted break described above, and it is declared. |
| Cutting failures from the video | The recorded logs keep every failed test and the refused verification. |

## Judging criteria

| Criterion | Weight | What we point to |
| --- | --- | --- |
| Value and track relevance | 35% | Three office processes described by voice run nightly with no model after one learning session. Capabilities grow per task; access does not. |
| Originality | 25% | One monster per process on a shared shelf; the model is used to learn and to repair, never to run; authority is an invitation the person signs. |
| Working end to end | 20% | The recorded runs above, and the video. See "Not proven yet". |
| Technical execution | 10% | Sandboxed worker, three gates before a tool is trusted, 54 tests, versioned shelf. |
| Validation and honest limitations | 10% | This file. |

## Not proven yet

- **The whole flow through the lab service with a real monster.** The recorded runs used the command-line entry point. Through the service, a real monster has been seen writing six tools; a complete learn → lab check → seal → scheduled run has passed only with a scripted monster in a test.
- **The recorded runs predate the sandbox.** The sandbox is proven by its own test and one tool run by hand, not by a full monster session.
- **Reuse and repair through the service** are proven by the recorded runs only.
- **The mailbox is simulated.** It is a local mail server in Docker holding six test emails, read through the same read-only connector that would read a real mailbox.
- **A real site change** has never triggered a repair; only the planted one has.

## Check it yourself

```sh
pnpm install
pnpm --filter @repo/lab test     # 54 tests, including the sandbox and the install check
pnpm dev:all                     # database, mailbox, lab service, web app
```

Then open the Reliquary (empty), give an interview, invite the sites, start, and watch the Lab page.
