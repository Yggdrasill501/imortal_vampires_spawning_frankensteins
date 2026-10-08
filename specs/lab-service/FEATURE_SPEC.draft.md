# Lab Service and Data Model Specification

> Purpose: The specification of the lab service (`apps/lab`) and its records: the process, its configuration, the database schema, the files on disk, every endpoint, the live event stream, the work queue, the state machines, and the interfaces the later parts plug into. It is part 1 of the product overview (`specs/product-overview/FEATURE_SPEC.draft.md`), which stays the source of truth for flows, terms, states and rules.

## Overview

The lab service is one Node process built on Fastify. It is the only thing that touches the database, the shelf, the invitation, the logins and any outside service. The web app talks only to it, over HTTP and one server-sent event stream. It serves one user on one machine and has no sign-in.

This part delivers the service's skeleton and everything that is a record: the full schema, every endpoint in the overview's API Surface table, the event stream, the dispatcher that picks up queued work, and the one place where each status may change. The parts that do the actual work (checking and running tools, enforcing the invitation in a browser, the monster, the orchestrator, the schedule's timing) are specified elsewhere. This part defines the interface each of them plugs into, called a **seam**, and ships a **stand-in** for each, so the service starts, answers every endpoint and moves records through their states before any real part exists.

When this part is built, the web app runs against it in real mode: health is shown, an interview is saved and read, the invitation is stored, and every command is either carried out or refused with one sentence. With the stand-ins in place, an interview is read as "nothing found". Each later part replaces one stand-in and changes nothing else here.

## Product Integration

- **Workspace package.** The service lives at `apps/lab`, package name `@repo/lab`. It has a `dev` script, so `pnpm dev` and `pnpm dev:all` start it next to the web app with no change to the root scripts.
- **Web app.** The web app (`apps/web`) reaches the service at `http://localhost:4000` by default (`DEFAULT_LAB_URL` in `@repo/contract`). The service's request and response bodies and its events are exactly the types in `@repo/contract`; the service imports that package and its route handlers are typed by it. The service uses the contract's `PATHS` for its routes.
- **Database.** All records are read and written through `@repo/db` (Kysely on `pg`). Migrations live in `packages/db/migrations`; the generated types in `packages/db/src/schema.ts` are the service's row types.
- **Configuration.** The service loads the single `.env` at the repository root, as the database tooling does. It never prints a configuration value that is a secret.
- **Later parts.** Parts 2 to 6 of the overview's Spec Breakdown each implement one seam (see Seams). They add files inside `apps/lab/src/seams/` and nowhere else in this part's modules.

Files outside `apps/lab` that this part changes: the three migrations and the regenerated `packages/db/src/schema.ts`; `.gitignore` (two entries, see Files on disk); `.env.example` (the variable names in Configuration); `README.md` (layout, the service's address, the starting kit is listed by part 4).

**Out of scope**, each owned by another spec:

- How a tool is written and checked (part 2).
- How a run executes a chain (part 2).
- How the invitation is enforced in the browser and in connector calls (part 3).
- How a monster learns or repairs (part 4).
- How the transcript becomes processes (part 5).
- The scheduler's timing rules (part 6).
- The web app (part 7).
- Record mode.
- A reject action.
- Pickup of work from Slack and Linear.

## Interaction Design

The service has no screen. What the user feels of it comes through the web app, and four behaviours make that feel right:

1. **Commands answer at once.** No command waits for an agent, a browser or a tool. A command changes records, queues work and returns the record as it now is. Everything slow happens afterwards and is announced by events.
2. **A refusal is one sentence.** Every command the service does not carry out answers with one plain sentence fit to show the user as it is, and changes nothing.
3. **Status is read, never pushed.** Events say what changed and what to read again. A client that missed every event and reads again sees the truth.
4. **Nothing happens twice.** Pressing a button twice, restarting the service or reconnecting the stream never starts the same work a second time.

**Sentences.** Every sentence the service writes for the user (refusals, reasons, read errors, verification lines) is in English, is one sentence, ends with a full stop, and uses plain words: "process", "tool", "site", "agent", "the lab". It never uses the themed names (they belong to the web app), never the words "monster" or "orchestrator", and never contains a login.

## Terminology

The overview's terms apply unchanged. These are this part's additions.

| Term              | User-Facing | DB/Code             | Definition                                                                                                        |
| ----------------- | ----------- | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Seam              | —           | `seam`              | An interface in the service that a later part implements. Exactly one implementation is registered per seam.      |
| Stand-in          | —           | `standin`           | The simple implementation of a seam that ships with this part. It is replaced, not extended.                      |
| Dispatcher        | —           | `dispatcher`        | The loop that claims queued work and starts it.                                                                   |
| Claim             | —           | `claim`             | The transaction that moves one piece of work from waiting to running, so that it starts once.                     |
| Pipeline          | —           | `pipeline`          | The fixed sequence of steps the service performs for one claimed piece of work.                                   |
| Lifecycle module  | —           | `lifecycle`         | The one module allowed to change the status of one kind of record.                                                |
| Action            | —           | `monster_action`    | One thing a monster did, as one sentence with a kind and a time.                                                  |
| Verification line | —           | `verification_line` | One line of the service's own checking of a monster's work.                                                       |
| Site identity     | Site        | `site`              | A website's host name in lower case with no scheme, port or path, or a connector's name in lower case (`gmail`).  |
| Candidate version | —           | —                   | A tool version made by a repair that has not yet been verified. It is not current and is not shown as a version.  |
| Gate              | —           | `gate`              | The service's answer to "is this site invited", its hand-out of logins, and its recording of refusals.            |
| Workspace         | —           | `workspace`         | A folder for one monster run, where it writes drafts. Outside the shelf.                                          |

## User Roles & Permissions

There is one user and no sign-in. The service accepts every request that comes from the web app's origin or from the machine itself. It listens on the loopback interface only.

| Caller                         | May                                                                                              | May never                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Web app (the user)             | Call every endpoint in API Surface.                                                              | Receive a login. Change a status by any means other than the commands.                            |
| Orchestrator seam              | Return proposed processes for one transcript.                                                    | Write any record. Reach the gate.                                                                 |
| Monster seam                   | Call the monster hooks (see Seams) for its own monster run.                                      | Write any record directly. Change the invitation. Change a tool another monster run created, except the one tool a repair is for. |
| Shelf seam, runner seam        | Read what they are handed and answer. Report steps and refusals through their hooks.             | Write any record directly. Call an AI model. Change the invitation.                               |
| Invitation enforcer (part 3)   | Ask the gate whether a site is invited, ask it for a login, tell it about a refused attempt.     | Change the invitation.                                                                            |

Only `PUT /invitation` changes the invitation and the logins file. No seam has a way to do it.

## User Flows

These are the service's side of the overview's flows. Each names the records that change; the exact rules are in the sections that follow.

### Flow 1: An interview is saved and read

**Entry Point**: `POST /interviews`.

**Preconditions**: None.

**Steps**:

1. The service stores the interview with status `being_read` and answers at once.
2. The dispatcher claims the interview and calls the orchestrator seam with the transcript.
3. The service validates what comes back and stores one `proposed` process per proposal, in the order given, with its sites.
4. The interview becomes `proposed`, or `nothing_found` when there were no proposals. An `interview.status` event follows.

**Result**: The interview carries its proposed processes. Nothing else has run.

**Error Handling**: If the seam fails, times out, or returns something invalid, the interview stays `being_read` and gains a read error of one sentence; it is not read again. The web app saves the transcript again as a new interview.

### Flow 2: Invite and start

**Entry Point**: `PUT /invitation`, then `POST /interviews/:id/start`.

**Preconditions**: The interview is `proposed` and has not been started.

**Steps**:

1. `PUT /invitation` stores the sites and the logins.
2. `POST /interviews/:id/start` checks that every site of every remaining proposed process is invited and that every such site that needs a login holds one.
3. In one transaction each proposed process becomes `queued` and gets one queued learn monster run, and the interview's invited time is set.

**Result**: Monster runs wait for the dispatcher.

**Error Handling**: A missing site or login refuses the start and names it. Nothing is queued.

### Flow 3: A monster run is carried out

**Entry Point**: The dispatcher claims a queued monster run.

**Steps**: The learn pipeline or the repair pipeline (see Pipelines).

**Result**: The monster run is `verified` or `failed`, and its process has moved accordingly.

### Flow 4: A tick and its runs

**Entry Point**: `POST /processes/:id/run`, or the dispatcher finding a sealed process whose next run time has passed.

**Steps**: The tick pipeline creates one pending run per new item; the dispatcher claims each run and the run pipeline carries it out.

**Result**: One run record per item; passed items are recorded as handled.

**Error Handling**: A failed run starts a repair; a refused run pauses the process (see State Diagram).

### Flow 5: Restart

**Entry Point**: The service starts and its database answers.

**Steps**: Recovery (see Work Queue and Dispatcher) settles everything that was running when the service stopped, then the dispatcher starts.

**Result**: No record is left in a running state that nothing is working on.

## Service Structure

### Modules

All under `apps/lab/src`.

| Module                     | Responsibility                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main`                     | Entry point. Loads configuration, builds the server, starts listening, starts recovery and the dispatcher, handles stop signals.                                            |
| `config`                   | Reads the repo-root `.env` and the environment, applies defaults, validates, exposes one frozen configuration object. Builds the environment handed to agent child processes. |
| `server`                   | The Fastify instance: cross-origin access, the error shape, request logging, route registration.                                                                            |
| `routes/*`                 | One file per group of endpoints: `health`, `interviews`, `invitation`, `processes`, `tools`, `runs`, `monster-runs`, `events`. Handlers validate, call a lifecycle or store module, and answer with a view. They hold no rules of their own. |
| `views`                    | Builds the `@repo/contract` shapes from rows. The only place that knows both the row types and the contract types.                                                          |
| `lifecycle/interview`      | The only module that changes `interview.status` and the read fields.                                                                                                        |
| `lifecycle/process`        | The only module that changes `process.status`, and with it the reason, cause, repaired mark, next run time and the seal and retire times.                                   |
| `lifecycle/monster-run`    | The only module that changes `monster_run.status`.                                                                                                                          |
| `lifecycle/run`            | The only module that changes `run.status` and `run_step.status`, and the only writer of passed entries in `handled_item`.                                                   |
| `lifecycle/tick`           | The only module that changes `tick.status`.                                                                                                                                 |
| `dispatcher`               | The loop: eligibility, claiming, limits, timeouts, and the creation of due scheduled ticks.                                                                                 |
| `recovery`                 | Runs once per start, before the dispatcher.                                                                                                                                 |
| `pipelines/read`           | Carries out one claimed interview.                                                                                                                                          |
| `pipelines/learn`          | Carries out one claimed learn monster run, including the service's own verification.                                                                                        |
| `pipelines/repair`         | Carries out one claimed repair monster run, including verification and the repair record.                                                                                   |
| `pipelines/tick`           | Carries out one claimed tick.                                                                                                                                               |
| `pipelines/run`            | Carries out one claimed run.                                                                                                                                                |
| `store/shelf-index`        | The only writer of `tool`, `tool_site`, `tool_version`, `process_step`, and of folders in the shelf.                                                                        |
| `store/invitation`         | The only writer of `invitation_site`.                                                                                                                                       |
| `store/logins`             | The only reader and writer of the logins file.                                                                                                                              |
| `store/gate`               | Answers whether a site is invited, hands out a login, records a refusal. The only writer of `refusal`.                                                                      |
| `store/monster-log`        | The only writer of `monster_action`, `verification_line`, `monster_run_tool` and a monster run's token figures.                                                             |
| `events`                   | The event bus, event ids, the recent-event buffer and the `GET /events` stream.                                                                                             |
| `seams/types`              | The seam interfaces.                                                                                                                                                        |
| `seams/registry`           | Names the one implementation of each seam. The only file a later part edits outside its own seam folder.                                                                    |
| `seams/standins/*`         | The five stand-ins. Each is deleted when its real part lands.                                                                                                               |

Rule of ownership: a table has exactly one writing module. Any other module that needs a change calls that module's function, inside the caller's transaction where one is open.

### Start and stop

**Start.**

1. `config` loads and validates. An invalid value stops the process with one line naming the variable.
2. The shelf folder and the data folder are created if missing.
3. The server listens. From this moment `GET /health` answers, whether or not the database does.
4. The service tries the database every 2 seconds until it answers and the schema is present. Then `recovery` runs once, then the dispatcher starts.

The service does not run migrations. Until step 4 completes, every endpoint except `GET /health` and `GET /events` answers with the `internal` error "The lab cannot reach its database."

**Stop** (interrupt or terminate signal).

1. The dispatcher stops claiming.
2. Every running seam call is told to stop through its stop signal.
3. The service waits up to 5 seconds for pipelines to return, closes every event stream, closes the server and the database pool, and exits.

Stopping writes no statuses. Whatever is still marked running is settled by `recovery` at the next start; that is the one place that deals with interrupted work.

**The `dev` script** runs the TypeScript entry directly with a runner that understands the workspace's TypeScript sources (the `@repo/db` and `@repo/contract` packages export source files with no build step) and restarts the service when a file under `apps/lab/src` changes. It watches nothing else: the shelf, the data folder and workspaces are outside `src`, so a monster writing a tool never restarts the service. The package also has `start` (run once, no watching), `typecheck`, `lint` and `test` scripts.

### Configuration

All values come from the repo-root `.env` or the process environment; the environment wins.

| Variable                  | Default                                        | Meaning                                                                                              |
| ------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | none; required                                 | The Postgres connection string.                                                                      |
| `LAB_PORT`                | `4000`                                         | The port the service listens on.                                                                     |
| `LAB_HOST`                | `localhost`                                    | The interface. Loopback only; the service must answer a browser at `http://localhost:4000`.          |
| `LAB_WEB_ORIGINS`         | `http://localhost:3000,http://127.0.0.1:3000`  | Comma-separated origins allowed to call the service.                                                 |
| `LAB_SHELF_DIR`           | `shelf` at the repository root                 | The shelf folder.                                                                                    |
| `LAB_DATA_DIR`            | `.lab` at the repository root                  | The service's private folder: the logins file and workspaces.                                        |
| `LAB_MODEL`               | `auto`                                         | The model name stored on every new monster run and handed to the orchestrator and monster seams.     |
| `LAB_MAX_MONSTERS`        | `3`                                            | How many monster runs may be running at once.                                                        |
| `LAB_MAX_RUNS`            | `2`                                            | How many runs may be running at once, across processes.                                              |
| `LAB_READ_TIMEOUT_MS`     | `300000`                                       | The longest the orchestrator seam may take for one interview.                                        |
| `LAB_MONSTER_TIMEOUT_MS`  | `1200000`                                      | The longest the monster seam may take for one monster run.                                           |
| `LAB_RUN_TIMEOUT_MS`      | `120000`                                       | The longest one run, one item lookup or one tool replay may take.                                    |
| `LAB_DISPATCH_INTERVAL_MS`| `1000`                                         | How often the dispatcher looks for work when nothing woke it.                                        |
| `LAB_LOG_LEVEL`           | `info`                                         | The lowest log level written.                                                                        |
| `LAB_AGENT_USE_API_KEY`   | `0`                                            | When `1`, the Cursor key from `CURSOR_API_KEY` is passed to agent child processes.                   |

The web app's own values are `NEXT_PUBLIC_LAB_URL` (the service's address) and `NEXT_PUBLIC_LAB_MOCK` (`0` turns its simulation off). They are read by the web app, not by the service.

**The Cursor key.** The Cursor command-line agent uses a `CURSOR_API_KEY` environment variable when it finds one, in place of the account the user's command line is signed in with. The root `.env` may hold that variable for other purposes. Therefore: at start, `config` reads `CURSOR_API_KEY` into its own memory and removes it from the service's process environment. `config` offers one function that builds the environment for an agent child process; every seam that starts an agent must use it. That environment contains `CURSOR_API_KEY` only when `LAB_AGENT_USE_API_KEY` is `1`. It never contains `DATABASE_URL` or any other secret from `.env`.

### Logging

The service writes one JSON line per event to standard output, through the server's logger, at or above `LAB_LOG_LEVEL`.

| Logged                                   | Level   | Fields                                                             |
| ---------------------------------------- | ------- | ------------------------------------------------------------------ |
| Every request                            | `info`  | method, path, status, duration                                     |
| Every status change                      | `info`  | record kind, id, from, to, the trigger                             |
| Every seam call, at start and at end     | `info`  | seam, method, the record it is for, duration, outcome              |
| Every claim                              | `debug` | record kind, id                                                    |
| Every refused command                    | `info`  | path, error code, the sentence                                     |
| Every unexpected failure                 | `error` | the error and its stack                                            |

Never logged: request bodies of `PUT /invitation`, any login, any value from `.env`, transcript text.

### Error shape

Every answer that is not a success is JSON `{ "error": string, "code": string }`, the contract's `ApiError`. `error` is one sentence fit to show the user. This holds for every failure the server can produce, including unknown routes, malformed JSON and failed validation; the framework's default error bodies are never sent.

| Code            | HTTP | When                                                                                                    |
| --------------- | ---- | ------------------------------------------------------------------------------------------------------- |
| `invalid`       | 400  | The request itself is wrong, or it asks for something the rules forbid regardless of timing.            |
| `not_found`     | 404  | No such record, or no such route. Sentence: "Nothing by that name exists in the lab."                   |
| `state_changed` | 409  | The record is not in the state the command needs.                                                       |
| `internal`      | 500  | Anything else. Sentence: "The lab failed to do that. Nothing was changed." or the database sentence.    |

A refused command changes no record. Every command runs in one transaction; a failure rolls it all back.

### Cross-origin access

The service answers cross-origin requests from the origins in `LAB_WEB_ORIGINS`, for the methods GET, POST, PUT and DELETE, with the `content-type` request header, including the preflight request and including `GET /events`. Credentials are not used. A request from any other origin gets no cross-origin permission. Requests with no origin (command-line tools on the machine) are served.

## Files on Disk

| Path                                        | Holds                                                                                              | Committed          |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------ |
| `shelf/`                                    | The shelf. Empty at the start. Created by the service when missing.                                | No (`/shelf/`)     |
| `shelf/<tool name>/v<version>/`             | The code of one tool version. Written once, by `store/shelf-index`, and never changed or removed.  | No                 |
| `.lab/logins.json`                          | The logins: one entry per site identity, each a name and a password. Readable by the owner only.   | No (`/.lab/`)      |
| `.lab/workspaces/<monster run id>/`         | The workspace of one monster run: its drafts and whatever part 4 keeps there.                      | No                 |

`.gitignore` gains `/shelf/` and `/.lab/`. Nothing else is written to disk; there are no run artefact files: everything a run produces is in the database.

- A tool name is 1 to 64 characters: lower-case letters, digits and underscores, starting with a letter. It is the folder name and the tool's address in `GET /tools/:name`. The service refuses any other name.
- A version folder is `v` followed by the version number. Version numbers start at 1 and are never reused, including the number of a candidate version that failed verification.
- The database stores a version's location relative to the shelf folder (`orangehrm_login/v1`). Views serve it relative to the repository root when the shelf is inside the repository (`shelf/orangehrm_login/v1`), otherwise as an absolute path.
- The logins file is replaced as a whole by writing a new file beside it and renaming it over the old one. Whether a login is held for a site is read from this file; it is stored nowhere else.

## Data Model

Records live in Postgres. Conventions for every table:

- Table and column names are snake case. Primary keys named `id` are UUIDs generated by the database.
- Times are `timestamptz`. Views serve them as ISO 8601 UTC strings. Durations are whole milliseconds.
- A status or kind is a `text` column with a check constraint listing its allowed values, exactly the values in `@repo/contract`.
- A "facts" column is `jsonb` holding an ordered array of `{label, value}` pairs, both strings.
- Foreign keys restrict deletion. The only rows ever deleted are a proposed process with its sites (`DELETE /processes/:id`), a withdrawn `invitation_site`, and a process's `process_step` rows when its chain is saved again.

### Tables

**`interview`**

| Column              | Type        | Rules                                                                                 |
| ------------------- | ----------- | ------------------------------------------------------------------------------------- |
| `id`                | uuid        | Primary key.                                                                          |
| `status`            | text        | `being_read`, `proposed`, `nothing_found`. Default `being_read`.                      |
| `read_started_at`   | timestamptz | Null until claimed.                                                                   |
| `read_error`        | text        | Null unless the reading failed. One sentence.                                         |
| `language`          | text        | BCP 47 tag. Not null.                                                                 |
| `transcript`        | jsonb       | Ordered array of `{speaker, text}`; speaker is `agent` or `user`. Not null.           |
| `started_at`        | timestamptz | Not null.                                                                             |
| `ended_at`          | timestamptz | Not null.                                                                             |
| `continued_from_id` | uuid        | Null, or references `interview`.                                                      |
| `invited_at`        | timestamptz | Null until its processes were started.                                                |
| `created_at`        | timestamptz | Not null, default now.                                                                |

Index: (`status`, `created_at`).

**`process`**

| Column                   | Type        | Rules                                                                                                   |
| ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------- |
| `id`                     | uuid        | Primary key.                                                                                            |
| `interview_id`           | uuid        | References `interview`. Not null.                                                                       |
| `position`               | integer     | Order in which it was described, from 1. Unique with `interview_id`.                                    |
| `name`                   | text        | Not null.                                                                                               |
| `description`            | text        | Not null.                                                                                               |
| `success_criterion`      | text        | Not null.                                                                                               |
| `status`                 | text        | `proposed`, `queued`, `learning`, `awaiting_seal`, `failed_to_learn`, `sealed`, `repairing`, `needs_human`, `retired`. Default `proposed`. |
| `repaired`               | boolean     | Not null, default false. True from the first verified repair onward.                                    |
| `schedule_kind`          | text        | `daily` or `every`. Not null.                                                                           |
| `schedule_time`          | text        | `HH:MM`, 24-hour. Not null when the kind is `daily`, null otherwise.                                    |
| `schedule_minutes`       | integer     | 1 to 1440. Not null when the kind is `every`, null otherwise.                                           |
| `next_run_at`            | timestamptz | Null unless the status is `sealed`.                                                                     |
| `check_name`             | text        | Null until the chain was saved.                                                                         |
| `check_description`      | text        | Null until the chain was saved.                                                                         |
| `reason`                 | text        | One sentence. Not null exactly when the status is `failed_to_learn` or `needs_human`.                   |
| `cause_run_id`           | uuid        | References `run`. Not null exactly when the status is `needs_human`.                                    |
| `cause_refusal_id`       | uuid        | References `refusal`. Set when a refusal is why it needs a human.                                       |
| `verification_run_id`    | uuid        | References `run`. The run of the latest learn's verification.                                           |
| `current_monster_run_id` | uuid        | References `monster_run`. The monster run now queued or working, or the last one that ended.            |
| `latest_repair_id`       | uuid        | References `repair`. The latest verified repair.                                                        |
| `created_at`             | timestamptz | Not null, default now.                                                                                  |
| `sealed_at`              | timestamptz | Null until first sealed.                                                                                |
| `retired_at`             | timestamptz | Null until retired.                                                                                     |

Unique: (`interview_id`, `position`). Indexes: (`status`), (`status`, `next_run_at`). Check constraints hold the three "exactly when" rules above and the schedule column rule.

**`process_site`**: the sites a process needs.

| Column         | Type    | Rules                                                |
| -------------- | ------- | ---------------------------------------------------- |
| `process_id`   | uuid    | References `process`. Deleted with a removed proposal. |
| `site`         | text    | Site identity. Not null.                             |
| `kind`         | text    | `website` or `connector`.                            |
| `login_needed` | boolean | Not null.                                            |

Primary key: (`process_id`, `site`). Index: (`site`). A connector is read-only in this version; views serve `readOnly` as true for a connector and false for a website.

**`process_step`**: the chain.

| Column       | Type    | Rules                                                          |
| ------------ | ------- | -------------------------------------------------------------- |
| `process_id` | uuid    | References `process`.                                          |
| `position`   | integer | From 1.                                                        |
| `tool_id`    | uuid    | References `tool`. Not null.                                   |
| `origin`     | text    | `made` or `reused`: whether this process's monster made it.    |

Primary key: (`process_id`, `position`). Index: (`tool_id`). A step names a tool, not a version: a process always uses each tool's current version, which is how a repair reaches it.

**`invitation_site`**

| Column         | Type        | Rules                        |
| -------------- | ----------- | ---------------------------- |
| `site`         | text        | Primary key. Site identity.  |
| `kind`         | text        | `website` or `connector`.    |
| `login_needed` | boolean     | Not null.                    |
| `granted_at`   | timestamptz | Not null, default now.       |

**`tool`**

| Column                      | Type        | Rules                                                              |
| --------------------------- | ----------- | ------------------------------------------------------------------ |
| `id`                        | uuid        | Primary key.                                                       |
| `name`                      | text        | Unique. The format in Files on Disk, held by a check constraint.   |
| `description`               | text        | One sentence. Not null.                                            |
| `kind`                      | text        | `reads` or `writes`.                                               |
| `created_by_monster_run_id` | uuid        | References `monster_run`. Not null.                                |
| `created_for_process_id`    | uuid        | References `process`. Not null.                                    |
| `current_version_id`        | uuid        | References `tool_version`. Not null once its first version exists (set in the same transaction). |
| `created_at`                | timestamptz | Not null, default now.                                             |

**`tool_site`**: primary key (`tool_id`, `site`); `tool_id` references `tool`; `site` is a site identity. Index: (`site`).

**`tool_version`**

| Column              | Type        | Rules                                                                                     |
| ------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `id`                | uuid        | Primary key.                                                                              |
| `tool_id`           | uuid        | References `tool`. Not null.                                                              |
| `version`           | integer     | From 1. Unique with `tool_id`.                                                            |
| `code_path`         | text        | Relative to the shelf folder. Unique. Never updated.                                      |
| `origin_kind`       | text        | `learn` or `repair`.                                                                      |
| `monster_run_id`    | uuid        | References `monster_run`. The monster run that made it. Not null.                         |
| `examples`          | jsonb       | Ordered array of `{input: facts, result: facts}`. Default empty.                          |
| `became_current_at` | timestamptz | Null while it is a candidate version. Set once and never cleared.                         |
| `created_at`        | timestamptz | Not null, default now.                                                                    |

Unique: (`tool_id`, `version`). Views list only versions whose `became_current_at` is set.

**`monster_run`**

| Column          | Type        | Rules                                                                        |
| --------------- | ----------- | ---------------------------------------------------------------------------- |
| `id`            | uuid        | Primary key.                                                                 |
| `process_id`    | uuid        | References `process`. Not null.                                              |
| `kind`          | text        | `learn` or `repair`.                                                         |
| `status`        | text        | `queued`, `running`, `verified`, `failed`. Default `queued`.                 |
| `model`         | text        | Not null. `LAB_MODEL` at the moment it was queued.                           |
| `tokens_input`  | bigint      | Not null, default 0.                                                         |
| `tokens_output` | bigint      | Not null, default 0.                                                         |
| `tokens_cached` | bigint      | Not null, default 0.                                                         |
| `reason`        | text        | One sentence. Set when it failed.                                            |
| `failed_run_id` | uuid        | References `run`. Not null exactly when the kind is `repair`.                |
| `learned_on_item_id` | text   | The item the monster says it practised on. Used only to pick a different second example. |
| `what_changed`  | text        | A repair monster's own description of its change. Shown as its words, never used as evidence. |
| `created_at`    | timestamptz | Not null, default now.                                                       |
| `started_at`    | timestamptz | Null while queued.                                                           |
| `ended_at`      | timestamptz | Null until verified or failed.                                               |

Unique: one row per `process_id` among rows whose status is `queued` or `running`. Index: (`status`, `created_at`).

**`monster_run_tool`**: the tools a monster run made or reused. Primary key (`monster_run_id`, `tool_id`); `origin` is `made` or `reused`.

**`monster_action`**

| Column           | Type        | Rules                                                                                                                         |
| ---------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `id`             | uuid        | Primary key.                                                                                                                  |
| `monster_run_id` | uuid        | References `monster_run`. Not null.                                                                                           |
| `seq`            | bigint      | Generated, always increasing. Gives the order.                                                                                |
| `at`             | timestamptz | Not null, default now.                                                                                                        |
| `kind`           | text        | `search_shelf`, `open_page`, `click`, `type`, `read`, `reuse_tool`, `create_tool`, `test_tool`, `save_process`, `refused`.    |
| `text`           | text        | One sentence. Not null.                                                                                                       |
| `tool_name`      | text        | The tool involved, where there is one.                                                                                        |

Index: (`monster_run_id`, `seq`).

**`verification_line`**

| Column           | Type        | Rules                                              |
| ---------------- | ----------- | -------------------------------------------------- |
| `id`             | uuid        | Primary key.                                       |
| `monster_run_id` | uuid        | References `monster_run`. Not null.                |
| `seq`            | bigint      | Generated, always increasing.                      |
| `at`             | timestamptz | Not null, default now.                             |
| `text`           | text        | One sentence. Not null.                            |
| `outcome`        | text        | `pending`, `passed`, `failed`. Default `pending`.  |

Index: (`monster_run_id`, `seq`).

**`tick`**

| Column        | Type        | Rules                                                   |
| ------------- | ----------- | ------------------------------------------------------- |
| `id`          | uuid        | Primary key.                                            |
| `process_id`  | uuid        | References `process`. Not null.                         |
| `kind`        | text        | `scheduled` or `run_now`.                               |
| `status`      | text        | `queued`, `running`, `finished`. Default `queued`.      |
| `new_items`   | integer     | Null until finished. The number of runs the tick created; zero is "nothing new". |
| `created_at`  | timestamptz | Not null, default now.                                  |
| `started_at`  | timestamptz | Null while queued.                                      |
| `finished_at` | timestamptz | Null until finished.                                    |

Unique: one row per `process_id` among rows whose status is `queued` or `running`. Indexes: (`status`, `created_at`), (`process_id`, `finished_at`).

**`run`**

| Column           | Type        | Rules                                                                                              |
| ---------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `id`             | uuid        | Primary key.                                                                                       |
| `process_id`     | uuid        | References `process`. Not null.                                                                    |
| `tick_id`        | uuid        | References `tick`. Set for kinds `scheduled` and `run_now`.                                        |
| `monster_run_id` | uuid        | References `monster_run`. Set for kinds `verification` and `after_repair`: the pipeline that asked for it. |
| `kind`           | text        | `verification`, `scheduled`, `run_now`, `after_repair`.                                            |
| `item_id`        | text        | The item's stable identity. Not null.                                                              |
| `item_label`     | text        | Human-readable. Not null.                                                                          |
| `item_fields`    | jsonb       | Facts. Default empty.                                                                              |
| `status`         | text        | `pending`, `running`, `passed`, `failed`, `refused`. Default `pending`.                            |
| `created_at`     | timestamptz | Not null, default now.                                                                             |
| `started_at`     | timestamptz | Null while pending.                                                                                |
| `finished_at`    | timestamptz | Null until it ended.                                                                               |
| `duration_ms`    | integer     | Null until it ended.                                                                               |
| `model_calls`    | integer     | Not null, default 0. The number the runner seam reported.                                          |
| `proof_value`    | text        | The value of the check. Null when it was not present.                                              |
| `failed_step`    | integer     | Position of the failing or refused step.                                                           |
| `error`          | text        | One or two sentences. Set when failed or refused.                                                  |
| `repair_id`      | uuid        | References `repair`. The repair this failure led to.                                               |

Unique: one row per (`process_id`, `item_id`) among rows whose status is `pending` or `running`. Indexes: (`process_id`, `created_at`), (`status`, `created_at`), (`tick_id`).

**`run_step`**

| Column            | Type        | Rules                                                                         |
| ----------------- | ----------- | ----------------------------------------------------------------------------- |
| `run_id`          | uuid        | References `run`.                                                             |
| `position`        | integer     | From 1.                                                                       |
| `tool_id`         | uuid        | References `tool`. Not null.                                                  |
| `tool_version_id` | uuid        | References `tool_version`. The exact version this run uses. Not null.         |
| `status`          | text        | `running`, `passed`, `failed`, `refused`, `not_reached`. Default `not_reached`. |
| `input`           | jsonb       | Facts. What the step was given. Default empty.                                |
| `result`          | jsonb       | Facts. What the step returned. Default empty.                                 |
| `error`           | text        | Set when the step failed or was refused.                                      |
| `started_at`      | timestamptz | Null until reached.                                                           |
| `finished_at`     | timestamptz | Null until it ended.                                                          |

Primary key: (`run_id`, `position`). The rows for every step are created with the run, each pinned to a tool version, so a run's record is complete even when it stops early.

**`handled_item`**

| Column       | Type        | Rules                                                        |
| ------------ | ----------- | ------------------------------------------------------------ |
| `process_id` | uuid        | References `process`.                                        |
| `item_id`    | text        | The item's stable identity.                                  |
| `outcome`    | text        | `passed` or `set_aside`.                                     |
| `run_id`     | uuid        | References `run`. The run that passed, or the stuck run. Not null. |
| `at`         | timestamptz | Not null, default now.                                       |

Primary key: (`process_id`, `item_id`).

**`repair`**

| Column            | Type        | Rules                                                                    |
| ----------------- | ----------- | ------------------------------------------------------------------------ |
| `id`              | uuid        | Primary key.                                                             |
| `tool_id`         | uuid        | References `tool`. The tool at the failing step. Not null.               |
| `process_id`      | uuid        | References `process`. Not null.                                          |
| `monster_run_id`  | uuid        | References `monster_run`. Unique. Not null.                              |
| `from_version_id` | uuid        | References `tool_version`. The version that failed. Not null.            |
| `to_version_id`   | uuid        | References `tool_version`. Null when no version verified.                |
| `failed_run_id`   | uuid        | References `run`. Not null.                                              |
| `retry_run_id`    | uuid        | References `run`. The `after_repair` run that passed, when there is one. |
| `item_label`      | text        | Label of the item the run failed on. Not null.                           |
| `what_failed`     | text        | The error, one or two sentences. Not null.                               |
| `what_changed`    | text        | The monster's description of its change. Not null; empty when it made none. |
| `result`          | text        | `verified` or `not_fixed`.                                               |
| `reason`          | text        | One sentence. Not null exactly when the result is `not_fixed`.           |
| `created_at`      | timestamptz | Not null, default now.                                                   |

Indexes: (`tool_id`, `created_at`), (`process_id`). A repair's tokens are those of its monster run.

**`refusal`**

| Column           | Type        | Rules                                                            |
| ---------------- | ----------- | ---------------------------------------------------------------- |
| `id`             | uuid        | Primary key.                                                     |
| `site`           | text        | The site that was not invited. Not null.                         |
| `stage`          | text        | `install`, `run`, `explore`.                                     |
| `at`             | timestamptz | Not null, default now.                                           |
| `tool_name`      | text        | The tool that tried, where one did.                              |
| `tool_version`   | integer     | Its version, where known.                                        |
| `process_id`     | uuid        | References `process`. Not null.                                  |
| `run_id`         | uuid        | References `run`.                                                |
| `monster_run_id` | uuid        | References `monster_run`.                                        |

Check: at least one of `run_id` and `monster_run_id` is set. Indexes: (`at`), (`run_id`), (`monster_run_id`).

### Constraints across tables

Held by the writing module, in the same transaction as the write:

- A tool is never deleted and a tool version is never deleted or overwritten. No module contains a delete or a `code_path` update for them.
- From `queued` onward, every site of a process is in `invitation_site`. `POST /interviews/:id/start` checks it; `PUT /invitation` refuses to withdraw a site that a process which is not retired needs.
- A tool's sites are all in `invitation_site`, and all within the sites of every process whose chain or monster run uses it. `store/shelf-index` refuses a creation, a reuse or a chain that breaks this.
- A `handled_item` row with outcome `passed` is written only by `lifecycle/run`, in the transaction that marks the run `passed`. A row with outcome `set_aside` is written only by Resume.
- No login is ever written to the database. `store/monster-log` replaces any occurrence of a held password in an action's text with "the password" before storing it.

### Migration plan

Three migrations, created with `pnpm db:migrate:make <name>` in this order, so each build piece (see Verification) migrates only what it uses:

| Order | Name                              | Creates                                                                                                                                             |
| ----- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `interviews_processes_invitation` | `interview`, `process` (without its references to later tables), `process_site`, `invitation_site`.                                                 |
| 2     | `shelf_and_monster_runs`          | `monster_run` (without `failed_run_id`'s reference), `tool`, `tool_site`, `tool_version`, `process_step`, `monster_run_tool`, `monster_action`, `verification_line`; the reference from `process.current_monster_run_id`. |
| 3     | `runs_ticks_repairs_refusals`     | `tick`, `run`, `run_step`, `handled_item`, `repair`, `refusal`; the references from `process.verification_run_id`, `process.cause_run_id`, `process.cause_refusal_id`, `process.latest_repair_id` and `monster_run.failed_run_id`, and the check constraints that depend on them. |

Each migration has a working down step. After applying them the schema types are regenerated and committed: `pnpm db:migrate && pnpm db:codegen`.

## State Diagram

A status changes in exactly one module, through one function per transition. Each function performs a conditional change ("from this status to that status") inside a transaction; if no row changed, the transition did not happen and the caller is told. Events are sent only after the transaction commits.

### Interview — `lifecycle/interview`

| From         | To              | Trigger                                              | Also changes                                    |
| ------------ | --------------- | ---------------------------------------------------- | ----------------------------------------------- |
| (new)        | `being_read`    | `POST /interviews`                                   | —                                               |
| `being_read` | `proposed`      | The read pipeline stored one or more proposals.      | Creates the `process` and `process_site` rows.  |
| `being_read` | `nothing_found` | The read pipeline received no proposals.             | —                                               |
| `being_read` | `being_read`    | The read failed.                                     | Sets `read_error`. It is not read again.        |

`proposed` and `nothing_found` are final.

### Process — `lifecycle/process`

| From                         | To                | Trigger                                                                                     | Also changes                                                                                               |
| ---------------------------- | ----------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| (new)                        | `proposed`        | The read pipeline.                                                                          | —                                                                                                          |
| `proposed`                   | `queued`          | `POST /interviews/:id/start`                                                                | Queues a learn monster run; sets `current_monster_run_id`.                                                 |
| `queued`                     | `learning`        | The dispatcher claimed its learn monster run.                                               | —                                                                                                          |
| `learning`                   | `awaiting_seal`   | The learn pipeline verified the work.                                                       | Sets `verification_run_id`.                                                                                |
| `learning`                   | `failed_to_learn` | The learn pipeline failed, at any step.                                                     | Sets `reason`.                                                                                             |
| `failed_to_learn`            | `queued`          | `POST /processes/:id/learn`                                                                 | Clears `reason`; queues a new learn monster run; sets `current_monster_run_id`.                            |
| `awaiting_seal`              | `sealed`          | `POST /processes/:id/seal`                                                                  | Sets `sealed_at` and `next_run_at`; stores recorded examples (see the endpoint).                           |
| `sealed`                     | `repairing`       | A run of kind `scheduled` or `run_now` ended `failed`.                                      | Clears `next_run_at`; queues a repair monster run for that run; sets `current_monster_run_id`.             |
| `sealed`                     | `needs_human`     | A run of kind `scheduled` or `run_now` ended `refused`.                                     | Clears `next_run_at`; sets `reason`, `cause_run_id`, `cause_refusal_id`.                                   |
| `repairing`                  | `sealed`          | The repair pipeline verified the repair.                                                    | Sets `repaired` and `latest_repair_id`; sets `next_run_at`.                                                |
| `repairing`                  | `needs_human`     | The repair pipeline failed, at any step.                                                    | Sets `reason` and `cause_run_id` (the run that first failed), and `cause_refusal_id` when a refusal stopped it. |
| `sealed`, `repairing`        | `needs_human`     | Recovery found a run of this process that was running when the service stopped.             | Clears `next_run_at`; sets `reason` and `cause_run_id`.                                                    |
| `needs_human`                | `sealed`          | `POST /processes/:id/resume`                                                                | Records the stuck item as set aside; clears `reason` and both causes; sets `next_run_at`. `repaired` is kept. |
| any but `retired`            | `retired`         | `POST /processes/:id/retire`                                                                | Sets `retired_at`; clears `next_run_at`; ends its waiting work (see the endpoint).                         |

Rules that complete the table:

- A run outcome moves a process only when the process is `sealed` at that moment. A run that fails or is refused while its process is `repairing` or `needs_human` (another item of the same tick) changes only the run; its item stays unhandled and is found again by a later tick.
- A refused run never queues a repair.
- A failed `after_repair` run never queues another repair; it fails the repair pipeline.
- `next_run_at` is set, by asking the scheduling seam, every time a process enters `sealed`, every time a scheduled tick is created for it, and when its schedule is changed while `sealed`. It is null in every other status.
- "Sealed and repaired" is the status `sealed` with `repaired` true. It is not a status.

### Monster run — `lifecycle/monster-run`

| From      | To         | Trigger                                                                                   | Also changes                    |
| --------- | ---------- | ----------------------------------------------------------------------------------------- | ------------------------------- |
| (new)     | `queued`   | `lifecycle/process` queued it.                                                            | —                               |
| `queued`  | `running`  | The dispatcher claimed it.                                                                | Sets `started_at`.              |
| `running` | `verified` | Its pipeline's verification passed.                                                       | Sets `ended_at`.                |
| `running` | `failed`   | Its pipeline failed at any step, timed out, or recovery found it running after a restart. | Sets `ended_at` and `reason`.   |
| `queued`  | `failed`   | Its process was retired.                                                                  | Sets `ended_at` and `reason`.   |

A monster run stays `running` while the service verifies its work. `verified` and `failed` are final.

### Run — `lifecycle/run`

| From      | To        | Trigger                                                                                          | Also changes                                                                 |
| --------- | --------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| (new)     | `pending` | The tick pipeline, the learn pipeline or the repair pipeline created it.                         | Creates its `run_step` rows, each pinned to a tool version.                  |
| `pending` | `running` | The dispatcher claimed it.                                                                       | Sets `started_at`.                                                           |
| `running` | `passed`  | The runner seam reported every step passed and the check present.                                | Sets the end fields and `proof_value`; writes `handled_item` as `passed`.    |
| `running` | `failed`  | The runner seam reported a failed step or a missing check, the run timed out, or recovery found it running. | Sets the end fields, `failed_step` and `error`.                   |
| `running` | `refused` | The runner seam reported a refused step.                                                         | Sets the end fields, `failed_step` and `error`.                              |
| `pending` | `failed`  | Its process was retired before it started.                                                       | Sets `error`.                                                                |

Step statuses move `not_reached → running → passed | failed | refused`, driven by the runner seam's reports. `passed`, `failed` and `refused` are final for a run.

### Tick — `lifecycle/tick`

| From      | To         | Trigger                                                                                          | Also changes                          |
| --------- | ---------- | ------------------------------------------------------------------------------------------------ | ------------------------------------- |
| (new)     | `queued`   | `POST /processes/:id/run`, or the dispatcher found the process due.                              | —                                     |
| `queued`  | `running`  | The dispatcher claimed it.                                                                       | Sets `started_at`.                    |
| `running` | `finished` | The tick pipeline created its runs (possibly none).                                              | Sets `new_items` and `finished_at`.   |
| `queued`  | `finished` | Its process was retired, or was not `sealed` when the tick was claimed.                          | `new_items` is 0.                     |
| `running` | `queued`   | Recovery found it running with no runs created.                                                  | Clears `started_at`.                  |

A tick finishes when its runs are created, not when they end.

## API Surface

All bodies are JSON. Shapes are the named types of `@repo/contract`; where this table names a type, the service answers exactly that type. Successful commands answer 200; `POST /interviews` answers 201.

| Method and path                 | Request                 | Response                  | Allowed when                                                   | Otherwise                         |
| ------------------------------- | ----------------------- | ------------------------- | -------------------------------------------------------------- | --------------------------------- |
| `GET /health`                   | —                       | `HealthResponse`          | Always.                                                        | —                                 |
| `POST /interviews`              | `SaveInterviewRequest`  | `Interview`               | Always.                                                        | `invalid`                         |
| `GET /interviews/:id`           | —                       | `Interview`               | It exists.                                                     | `not_found`                       |
| `POST /interviews/:id/start`    | none                    | `StartInterviewResponse`  | The interview is `proposed`, not yet started, with a process left, and every needed site is invited and has its login. | `state_changed`, `invalid`, `not_found` |
| `DELETE /processes/:id`         | —                       | `RemoveProcessResponse`   | The process is `proposed`.                                     | `state_changed`, `not_found`      |
| `GET /invitation`               | —                       | `Invitation`              | Always.                                                        | —                                 |
| `PUT /invitation`               | `PutInvitationRequest`  | `Invitation`              | Every rule under the endpoint holds.                           | `invalid`                         |
| `GET /processes`                | —                       | `ListProcessesResponse`   | Always.                                                        | —                                 |
| `GET /processes/:id`            | —                       | `ProcessDetail`           | It exists.                                                     | `not_found`                       |
| `POST /processes/:id/learn`     | none                    | `ProcessDetail`           | The process is `failed_to_learn`.                              | `state_changed`, `not_found`      |
| `POST /processes/:id/seal`      | none                    | `ProcessDetail`           | The process is `awaiting_seal`.                                | `state_changed`, `not_found`      |
| `POST /processes/:id/run`       | none                    | `ProcessDetail`           | The process is `sealed`.                                       | `state_changed`, `not_found`      |
| `POST /processes/:id/resume`    | none                    | `ProcessDetail`           | The process is `needs_human`.                                  | `state_changed`, `not_found`      |
| `PUT /processes/:id/schedule`   | `PutScheduleRequest`    | `ProcessDetail`           | The process is neither `proposed` nor `retired`.               | `state_changed`, `invalid`, `not_found` |
| `POST /processes/:id/retire`    | none                    | `ProcessDetail`           | The process is not `retired`.                                  | `state_changed`, `not_found`      |
| `GET /tools`                    | —                       | `ListToolsResponse`       | Always.                                                        | —                                 |
| `GET /tools/:name`              | —                       | `Tool`                    | It exists.                                                     | `not_found`                       |
| `GET /runs`                     | query `processId`, `limit` | `ListRunsResponse`     | Always.                                                        | `invalid`                         |
| `GET /monster-runs`             | query `processId`       | `ListMonsterRunsResponse` | Always.                                                        | `invalid`                         |
| `GET /events`                   | —                       | An event stream           | Always.                                                        | —                                 |

A `state_changed` refusal names the state in its sentence, for example "This process is already sealed." or "This process is not waiting for a seal."

### What each endpoint does

**`GET /health`.** Always answers 200 with `service: "ok"`. `database` is `"ok"` when a query against the `interview` table answers within 2 seconds, `"error"` otherwise; an unreachable database and a schema that was never migrated are both `"error"`. Changes nothing.

**`POST /interviews`.** Refused as `invalid` unless: the transcript has at least one turn whose speaker is `user` and whose text is not blank; every turn has a known speaker and a text; the language is not blank; both times parse; and `continuedFrom`, when given, names an existing interview. Creates one `interview` row with status `being_read` and answers with it, with no processes. The reading happens afterwards (Flow 1). Saving the same transcript again creates another interview.

**`GET /interviews/:id`.** The interview, its transcript, its read error and its processes as summaries, in `position` order. Removed proposals are absent.

**`POST /interviews/:id/start`.** In one transaction:

- Refused as `state_changed` when the interview is `being_read` ("The transcript is still being read."), is `nothing_found` or has no proposed process left ("Nothing is left to start."), or `invited_at` is set ("These processes were already started.").
- Refused as `invalid` when a proposed process needs a site that is not in `invitation_site` ("[Process] needs [site], which is not in the invitation."), or an invited site it needs has `login_needed` true and the logins file holds none ("[Site] needs a login.").
- Otherwise every `proposed` process of the interview moves to `queued` with one queued learn monster run each, and `invited_at` is set.

Events: `process.status` and `monster.status` for each, then `interview.status`. Answers with the interview.

**`DELETE /processes/:id`.** Deletes the `process` row and its `process_site` rows. Positions of the others do not change. Event: `interview.status` for its interview, as a hint to read it again.

**`GET /invitation`.** Every `invitation_site`, ordered by `granted_at` then site. For each: kind, `readOnly`, `loginNeeded`, `loginHeld` (read from the logins file), `grantedAt`, and `neededBy`: every process whose `process_site` names it, retired ones included. Never a login.

**`PUT /invitation`.** The body is the complete set of invited sites. The whole request is applied or none of it. Each site is reduced to its site identity first. Refused as `invalid` when:

- a site is blank, appears twice, or has an unknown kind;
- a login is given with a blank name or password;
- a site is new to the invitation and no process needs it ("[Site] is not needed by any process.");
- a site now in the invitation is left out while a process that is not retired needs it ("[Site] is still needed by [processes]. Retire them first.").

Otherwise: a new site gets an `invitation_site` row, with `login_needed` true when any process needing it says so; a site already there keeps its row and its `granted_at`; a site left out loses its row and its login; a login given replaces the one held; a site sent without a login keeps the login already held. Answers with the invitation as it now is. Changing the invitation changes no process, monster run or run.

**`GET /processes`.** Every process, retired ones included, ordered by its interview's `created_at`, then `position`. Each is a `ProcessSummary`: `lastRun` is its newest run that has started; `latestAction` is the newest action of its current monster run; `tokens` is the sum over all its monster runs; `reason` is served only in `failed_to_learn` and `needs_human`.

**`GET /processes/:id`.** The summary plus: the chain from `process_step`, each step with its tool's current version, kind, description and origin; the check; `verificationRunId`; `cause` while `needs_human` (kind `refusal` with the refusal and the run when `cause_refusal_id` is set, otherwise kind `run`); `latestRepair`; `lastTick`, the newest finished tick; `waitsFor` while `queued`, computed by the dispatcher's eligibility rule; and `runs`, the newest 200, each a full `Run`.

**`POST /processes/:id/learn`.** `failed_to_learn → queued` as in the state table.

**`POST /processes/:id/seal`.** `awaiting_seal → sealed`. In the same transaction, for every step of the verification run, the step's input and result are appended as one recorded example to the tool version that step used. The schedule becomes active: `next_run_at` is set.

**`POST /processes/:id/run`.** Creates one queued tick of kind `run_now`. When the process already has a tick that is queued or running, no second tick is created and the answer is the same: the process as it is. The tick's outcome follows as a `tick.finished` event.

**`POST /processes/:id/resume`.** `needs_human → sealed`. Writes `handled_item` for the item of `cause_run_id` with outcome `set_aside`, unless that item is already recorded. That item is never run again.

**`PUT /processes/:id/schedule`.** Refused as `invalid` unless the schedule is `daily` with a time of the form `HH:MM` between 00:00 and 23:59, or `every` with a whole number of minutes from 1 to 1440. Stores it. When the process is `sealed`, `next_run_at` is set again from the new schedule. Event: `process.status`, as a hint to read it again.

**`POST /processes/:id/retire`.** Any state but `retired` → `retired`. In the same transaction: its queued monster run fails with "The process was retired."; its queued tick finishes with no items; its pending runs fail with "The process was retired before this ran." After the commit, a running monster run of the process is told to stop and then fails with the same sentence. A run already running finishes its item and is recorded as it ends. Its tools, runs, repairs and refusals are kept.

**`GET /tools`.** Every tool, oldest first. `usedBy` is every process whose chain holds the tool, with its origin. `repairCount` counts its repair records. `codePath` is the current version's folder.

**`GET /tools/:name`.** The summary plus its versions (only those that became current, newest first, each with its origin, folder and recorded examples) and its repair records (newest first; tokens from the repair's monster run).

**`GET /runs`.** Runs, newest first by `created_at`, optionally of one process. `limit` defaults to 200 and is at most 1000. Each run carries its steps and its refusals. For a run that has not started, `startedAt` is its creation time; `durationMs` is 0 until it ends.

**`GET /monster-runs`.** Monster runs, newest first by `created_at`, optionally of one process, at most the newest 100. Each carries all its actions and verification lines in order, its tools made and reused (each reused tool with the process it was made for), its refusals, and for a repair the failed run and, once recorded, the repair.

### How the web app's required additions are met

| Web app requirement                                              | Met by                                                                                               |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1. Requests from the web app's origin                            | Cross-origin access.                                                                                 |
| 2. Server-sent events with the fourteen kinds                    | Live Events.                                                                                         |
| 3. Stored, ordered actions and verification lines                | `monster_action`, `verification_line`; `GET /monster-runs`.                                          |
| 4. Run: model calls, kind, item label, proof value, repair id    | Columns of `run`.                                                                                    |
| 5. Process: next run, last tick, cause, latest repair, verification run, current monster run, what it waits for | Columns of `process`, `tick`, and the eligibility rule. |
| 6. Site kind and login needed on proposed processes              | `process_site`.                                                                                      |
| 7. Login held; complete-set `PUT`; kept login                    | `GET /invitation`, `PUT /invitation`.                                                                |
| 8. Tool: reads or writes, made for, used by, made or reused      | `tool`, `process_step.origin`.                                                                       |
| 9. Refusals inside their runs and monster runs                   | `refusal`, served in both lists.                                                                     |
| 10. Interview saved at once; read error sentence                 | `POST /interviews`; `interview.read_error`.                                                          |
| 11. One sentence on every refusal                                | Error shape.                                                                                         |
| 12. Health as two facts                                          | `GET /health`.                                                                                       |
| 13. Item fields on a run; retry run on a repair                  | `run.item_fields`; `repair.retry_run_id`.                                                            |

## Live Events

`GET /events` is a server-sent event stream that stays open. Each message has an `id:` line holding the event's id and one `data:` line holding one JSON `LabEvent` from `@repo/contract`. No named event types are used. The service sends a comment line when the stream opens and at least every 15 seconds after, so a quiet stream is not mistaken for a dead one.

**Ids and order.** An event's id is a whole number written as a string. Ids rise by one with every event; the first id after a start is the start time in milliseconds, so ids keep rising across restarts. Events are sent in id order, and only after the change they describe has been committed. Every event carries its time.

**Reconnecting.** The service keeps the newest 1000 events in memory. A client that connects and names the last id it saw receives every kept event after that id, then live events. A client that names no id, or an id older than what is kept, receives live events only. In every case the client reads again what it shows: events are not stored, and a restart of the service forgets them.

**Events are hints.** No event is the source of a status. Each tells the web app what to append or what to read again; the truth is always the answer to a read.

| Kind                   | Payload beyond id, time and kind                                   | Sent when                                                                                                         |
| ---------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `interview.status`     | interview id, status                                               | An interview's reading ended (in any of its three outcomes); its processes were started; one of its proposals was removed. |
| `process.status`       | process id, status                                                 | A process changed status; or its schedule, repaired mark or chain changed while its status stayed the same.       |
| `monster.status`       | process id, monster run id, status                                 | A monster run was queued, claimed, verified or failed.                                                            |
| `monster.action`       | process id, monster run id, the action                             | An action was stored.                                                                                             |
| `monster.verification` | process id, monster run id, the line                               | A verification line was stored, and again when its outcome was set. The line keeps its id.                        |
| `monster.tokens`       | process id, monster run id, the token figures                      | A monster run's token figures were updated. They are totals so far, not increments.                               |
| `tool.created`         | tool name, process id, monster run id                              | A new tool was put on the shelf.                                                                                  |
| `tool.reused`          | tool name, process id, monster run id                              | A monster run took an existing tool into use, once per tool per monster run.                                      |
| `tool.version_current` | tool name, version                                                 | A version became current: the first version of a new tool, and a verified repair's version.                       |
| `run.started`          | process id, run id                                                 | A run was claimed.                                                                                                |
| `run.finished`         | process id, run id, status                                         | A run ended `passed`, `failed` or `refused`.                                                                      |
| `tick.finished`        | process id, tick id, number of new items                           | A tick finished.                                                                                                  |
| `refusal`              | refusal id, site, process id, run id, monster run id, tool name    | A refusal was recorded.                                                                                           |
| `repair.recorded`      | repair id, tool name, process id                                   | A repair record was stored.                                                                                       |

## Work Queue and Dispatcher

Four kinds of record are work: an interview that is `being_read` with no read start and no read error; a monster run that is `queued`; a tick that is `queued`; a run that is `pending`. The table is the queue; there is no other.

**The loop.** The dispatcher runs one pass whenever the service adds work or a pipeline ends, and at least every `LAB_DISPATCH_INTERVAL_MS`. One pass at a time: a pass that is asked for while one is running follows it. Each pass, in this order:

1. Creates due ticks: for every `sealed` process whose `next_run_at` has passed, in one transaction, it creates a queued tick of kind `scheduled` unless the process already has a tick queued or running, and sets `next_run_at` to the scheduling seam's next time.
2. Claims interviews, oldest first, and starts the read pipeline for each. At most one interview is being read at a time.
3. Claims eligible monster runs and starts the learn or repair pipeline for each.
4. Claims queued ticks, oldest first, and starts the tick pipeline for each.
5. Claims eligible runs and starts the run pipeline for each.

**Claiming.** A claim is one transaction that locks the candidate row, skipping rows another transaction holds, checks again that it is still waiting and still eligible, and moves it to its running status through its lifecycle module. Only a claim that changed the row starts a pipeline. The unique rules in the schema back this up: one live monster run per process, one live tick per process, one live run per process and item, one handled entry per process and item, one tool per name.

**Monster order.** A queued monster run may be claimed when all of these hold:

1. Fewer than `LAB_MAX_MONSTERS` monster runs are `running`.
2. No `running` monster run belongs to a process that shares a site with this one's process.
3. No queued monster run that is ahead of it belongs to a process that shares a site with this one's process.

"Ahead" is decided by a fixed order: repair monster runs before learn monster runs; among repairs, the one queued first; among learns, the process described first, meaning the earlier interview and, within an interview, the lower `position`. Two processes share a site when one site identity is in both of their `process_site` sets.

So processes that share no site learn at the same time, up to the limit, and processes that share a site learn one after another in the order they were described, each later one finding on the shelf what the earlier one made. A failed monster run does not hold back the ones behind it.

The same rule answers `waitsFor` for a queued process: the process of the first monster run that blocks it under rule 2 or 3 and the first site they share; or all null fields when only rule 1 holds it back.

**Run order.** A pending run may be claimed when fewer than `LAB_MAX_RUNS` runs are `running` and no other run of the same process is `running`. Among those, `verification` and `after_repair` runs come first, then the oldest. Runs of one tick are created, and so run, in the order the items were listed.

**Timeouts.** Each seam call has a limit. When it passes, the service tells the call to stop through its stop signal and treats the call as failed, whatever it later returns.

| Call                         | Limit                    | Outcome when it passes                                                                         |
| ---------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------- |
| Orchestrator, one interview  | `LAB_READ_TIMEOUT_MS`    | Read error: "Reading the transcript took too long and was stopped."                            |
| Monster, one monster run     | `LAB_MONSTER_TIMEOUT_MS` | The monster run fails: "The agent ran out of time."                                            |
| Runner, one run              | `LAB_RUN_TIMEOUT_MS`     | The run fails at the step it was on: "The run took too long and was stopped."                  |
| Runner, one item lookup      | `LAB_RUN_TIMEOUT_MS`     | Treated as a failed lookup (see the tick pipeline).                                            |
| Runner, one tool replay      | `LAB_RUN_TIMEOUT_MS`     | That verification line fails.                                                                  |

**Recovery.** Once per start, before the first pass, in this order:

| Found                                                   | Settled as                                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| An interview with a read start, still `being_read`, no read error | Its read start is cleared, so it is read again. Reading writes nothing outside the database.                                       |
| A `running` monster run                                 | `failed`, reason "The lab restarted while this was in progress." Its process moves as for any failed pipeline: `failed_to_learn`, or `needs_human` for a repair. |
| A `running` run of kind `verification` or `after_repair` | `failed`, error "The lab restarted during this run." Its monster run is settled by the row above.                                           |
| A `running` run of kind `scheduled` or `run_now`        | `failed` with the same error. No repair is queued. Its process, when `sealed` or `repairing`, becomes `needs_human` with the reason "The lab restarted during a run, so check that item by hand." and that run as the cause. |
| A `running` tick that has created runs                  | `finished`, with the number of runs it created.                                                                                              |
| A `running` tick that has created none                  | Back to `queued`.                                                                                                                            |

Queued monster runs, queued ticks and pending runs are left as they are and picked up by the first pass. An interrupted run is never run again by itself: it may have written to a site, and the person decides.

## Pipelines

A pipeline is the fixed sequence the service performs for one claimed record. The seams are called inside these sequences and nowhere else.

**Read pipeline** (one interview). Calls the orchestrator seam. Validates each proposal: a name, a description and a success criterion that are not blank; at least one site, each with a site identity, a kind and whether it needs a login; a valid schedule. Any invalid proposal fails the whole reading with "The reading came back in a form the lab could not use." Otherwise stores the proposals in the order given and moves the interview.

**Learn pipeline** (one learn monster run).

1. Creates the workspace and calls the monster seam with the hooks (see Seams). During the call the monster creates tools, takes tools into use and saves the chain, each through a hook that the service checks and records.
2. If the monster gave up, failed or timed out, or no chain was saved: the monster run fails with one sentence, and stops here.
3. Verification, with no monster involved. One verification line per check, stored as `pending` and then set:
   - For each tool this monster run made: the shelf seam checks the stored version again. Line: "Install check of [tool]."
   - The runner seam lists the process's items. The service takes the first item that is not recorded as handled and is not the one the monster practised on. With none: fail, "There was no second example to check the work on."
   - The service creates a `verification` run for that item and waits for it to end. Line: "The saved chain, run on a second example with no agent."
4. All lines passed: the monster run is `verified` and the process is `awaiting_seal`. Any line failed: the monster run is `failed` with the failing line's sentence as its reason and the process is `failed_to_learn`.

A passed verification run records its item as handled like any passed run, so the first scheduled tick does not enter it a second time.

**Repair pipeline** (one repair monster run, for one failed run).

1. Creates the workspace and calls the monster seam. Its hooks accept one thing only: a new version of the tool at the failing step, stored as a candidate version.
2. If the monster gave up, failed, timed out or produced no candidate: go to step 6 with its sentence.
3. The shelf seam checks the candidate. Line: "Install check of [tool], version [n]."
4. When the tool only reads: for each recorded example of the current version, the runner seam replays the candidate on the example's input, and the result must equal the recorded result. One line: "[Tool] reproduces its recorded examples." A tool that writes skips this step.
5. The service creates an `after_repair` run for the failed run's item, with the candidate pinned at the repaired step and every other step at its tool's current version, and waits for it to end. Line: "The failed item, run again with no agent."
6. Every line passed: in one transaction the candidate becomes the tool's current version and takes over the examples it reproduced plus the new run's step as an example; a `repair` row is stored with result `verified`, both versions and the passing run; the failed run gets its `repair_id`; the monster run is `verified`; the process is `sealed` with `repaired` true. Otherwise: a `repair` row is stored with result `not_fixed` and the reason; the failed run gets its `repair_id`; the monster run is `failed`; the process is `needs_human` with that reason.

Every repair monster run ends with exactly one repair record.

**Tick pipeline** (one tick).

1. If the process is not `sealed`, the tick finishes with no items.
2. The runner seam lists the process's items.
3. The service drops every item recorded in `handled_item` and every item that has a pending or running run, and creates one pending run per remaining item, in the listed order, of the tick's kind.
4. The tick finishes with the number of runs created.

If the lookup itself fails or times out, the service creates one run that is recorded as failed at step 1 with the lookup's error, with the item identity `lookup:` followed by the tick's id and the label "Looking for new work". The tick finishes with one item. That failed run takes the ordinary failure path, so a broken first tool is repaired like any other.

**Run pipeline** (one run). Calls the runner seam with the run, its item and its pinned steps. Records each step as the seam reports it. Ends the run with the seam's outcome through `lifecycle/run`, which records a passed item as handled. Then `lifecycle/process` applies the process transition, if any. The pipeline that created a `verification` or `after_repair` run is waiting for exactly this end.

## Seams

A seam is a TypeScript interface in `seams/types`. `seams/registry` names its one implementation. This part ships a stand-in for each. A later part **replaces** its stand-in: it deletes the stand-in file, adds its implementation under `seams/`, and changes one line of the registry. It does not wrap, extend or fall back to the stand-in, and it changes no route, lifecycle module, pipeline or table.

Every seam call receives a stop signal and must return promptly once it is raised. A seam call that throws is treated as a failure with the sentence "The lab failed while doing this."; a seam never writes a record itself.

| Seam         | Owner  | The service calls                                                    | With                                                                                         | Expects back                                                                                                              | Records and events that result                                                                             | Stand-in                                                                                           |
| ------------ | ------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Orchestrator | Part 5 | Propose processes, once per interview.                               | The interview id, transcript turns, language, the model name.                                | An ordered list of proposals: name, description, success criterion, sites (identity, kind, login needed), schedule. Or a failure with one sentence. | `process`, `process_site`; interview status or read error; `interview.status`.                             | Returns an empty list. Every interview becomes `nothing_found`.                                    |
| Monster      | Part 4 | Work, once per monster run.                                          | The monster run, its process with sites, success criterion and schedule, the interview transcript, for a repair the failed run with its steps and error, the workspace folder, the model name, the agent environment builder, and the monster hooks. | "Done", with the item it practised on (learn) or its description of the change (repair); or "gave up" with one sentence. | Everything the hooks record; then the pipeline's verification.                                             | Calls no hook. Returns "gave up": "The agent that learns and repairs is not built yet."            |
| Shelf        | Part 2 | Check a tool version: the install check.                             | A folder holding one tool version's code, and the invited site identities.                   | Passed, with what the tool declares: name, one-sentence description, sites, reads or writes. Or failed with one sentence and the uninvited sites it declares or names. | A verification line; on a new tool, `tool`, `tool_site`, `tool_version`; a `refusal` of stage `install` per uninvited site. | Fails: "The install check is not built yet."                                                       |
| Runner       | Part 2 | List items for a process. Run one item. Replay one tool on one input.| The process, its chain with each step's pinned version and folder, the check; for a run, the item and the run hooks; for a replay, one version folder and an input. | Items: stable identity, label, fields. A run outcome: passed, failed or refused, the proof value, the failing step, the error, and the number of model calls it made. A replay: the result, or an error. | `run`, `run_step`, `handled_item`, process transitions; `run.started`, `run.finished`.                     | Listing fails: "The runner is not built yet." A run fails at step 1 with the same sentence, reporting 0 model calls. A replay fails with it. |
| Scheduling   | Part 6 | Give the next run time.                                              | A schedule and a moment.                                                                     | The first time after that moment at which the schedule is due, or nothing.                                                | `process.next_run_at`; scheduled ticks created by the dispatcher.                                          | Returns nothing. `next_run_at` stays null and no scheduled tick is ever created. Run now still works. |

**The invitation's seam is the gate, and it points the other way.** Part 3 does not implement an interface the service calls; it builds the enforcer that sits in front of every browser request and connector call and calls `store/gate`, which this part delivers complete:

| Gate function        | Given                                                                              | Does                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Is this site invited | A site identity                                                                    | Answers from `invitation_site`.                                                                                                   |
| Login for this site  | A site identity that is invited and is among the sites of the tool or monster run asking | Answers with the name and password from the logins file, in memory only. Never logged, never stored elsewhere.              |
| Record a refusal     | The site, the stage, what tried (tool and version, process, run or monster run)    | Stores a `refusal`, sends a `refusal` event, and for a monster run also stores an action of kind `refused`. Returns the refusal.  |

Stand-in for the enforcer: there is none, and none is needed. The stand-in runner and monster open no browser and call no connector, so nothing can reach a site. The gate already answers and records.

**Monster hooks.** The monster seam reaches the service only through these. Each returns either success or a refusal with one sentence the monster can act on.

| Hook                 | Given                                              | The service does                                                                                                                                                                              |
| -------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read the shelf       | —                                                  | Returns every tool: name, description, sites, reads or writes, current version and its folder.                                                                                                |
| Record an action     | Kind, sentence, tool name where one is involved    | Stores the action; sends `monster.action`. Used for searching, opening, clicking, typing, reading and testing. The service itself records the kinds `create_tool`, `reuse_tool`, `save_process` and `refused`. |
| Report tokens        | Totals so far: input, output, cached               | Stores them; sends `monster.tokens`.                                                                                                                                                          |
| Create a tool        | A draft folder in the workspace (learn only)       | Calls the shelf seam on the draft. Passed, with a free name and sites inside the process's sites: copies the draft to `shelf/<name>/v1/`, stores the tool and its first version as current, records the action, sends `tool.created` and `tool.version_current`. Failed: nothing is put on the shelf; uninvited sites are recorded as refusals. |
| Take a tool into use | A tool name (learn only)                           | Refuses a tool whose sites are not all inside the process's sites. Otherwise stores it as reused, records the action, sends `tool.reused`.                                                    |
| Save the process     | Tool names in order, and the check: name and description (learn only) | Refuses a chain naming a tool this monster run neither made nor took into use. Otherwise replaces the process's chain and check, records the action, sends `process.status`.   |
| Submit a repair      | A draft folder (repair only)                       | Refuses a draft whose declared name is not the tool at the failing step. Otherwise copies it to the next version folder and stores it as a candidate version.                                 |

A tool that a learn monster run created stays on the shelf, current and reusable, even when that monster run later fails: it passed the install check, and tools are never deleted.

**Run hooks.** The runner seam reports through these: a step started (with its input), a step ended (passed, failed or refused, with its result or error). A refused step is reported after the enforcer has recorded the refusal through the gate.

## Key Design Decisions

| Decision                                                                                       | Rationale                                                                                                                                         |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| One writing module per table, one module per status.                                           | A status that can be changed in two places will one day be changed two ways. The build is done by several hands at once.                          |
| Pipelines own the sequence; seams only answer.                                                  | The later parts can be built side by side against fixed interfaces, and none of them can skip the service's verification.                         |
| Stand-ins fail honestly instead of pretending.                                                  | A stand-in that invented processes or passes would be simulated data shown as real. The web app already has a marked simulation for that.         |
| The table is the queue.                                                                        | One store, one truth, and a restart loses nothing that was waiting.                                                                               |
| Verification and after-repair runs go through the same run queue as every other run.           | One way to start a run and one place where a run ends, so "0 model calls" and the handled rule hold for all of them.                              |
| A chain step names a tool; a run step pins a version.                                          | The process follows a repair without being rewritten, and every run still records exactly what it ran.                                            |
| A repair's new version is a candidate until verified.                                          | The old version stays current until evidence exists, and a failed attempt is kept on disk without ever being used.                                |
| A tool made by a failed learn stays on the shelf.                                              | It passed the install check, tools are never deleted, and the next monster can reuse it.                                                          |
| A passed verification run records its item as handled.                                         | The verification really made the entry. Without this the first scheduled run would make it again.                                                 |
| A failed item lookup is recorded as a failed run.                                              | The first tool can break like any other. One failure path means it is repaired like any other.                                                    |
| While a process is repairing or paused, other items' failures change only their own runs.      | One repair at a time per process. The items stay unhandled and return with the next tick.                                                         |
| An interrupted run pauses its process instead of being retried.                                | It may already have written to a site. Running it again could enter the same person twice.                                                        |
| A failed reading leaves the interview as it is, with a sentence.                               | The overview gives an interview three statuses. The web app saves the transcript again, which is a new interview.                                 |
| Run now during a tick answers normally and starts nothing.                                     | The work the user asked for is already under way; a second tick would find the same items.                                                        |
| Events are kept in memory only.                                                                | They are hints. Everything they point at is a stored record that a read returns.                                                                  |
| Logins live in one owner-only file in the service's private folder.                            | Outside the shelf, the database and the committed source, as the overview requires, and one place to delete.                                      |
| A site enters the invitation only when a process needs it.                                     | Access is granted for work the person has just read, never in the abstract.                                                                       |
| The Cursor key is removed from the service's environment at start.                             | The agent would silently use it in place of the signed-in account. Passing it is a deliberate setting.                                            |
| The service does not run migrations.                                                           | `pnpm dev:all` already migrates before starting. A service that changes the schema on start hides that step.                                      |
| Statuses are text with check constraints.                                                      | They match the contract's strings exactly and a later value is one small migration.                                                               |

## Invariants

1. Only the lab service touches the database, the shelf, the logins file and outside services.
2. Each table is written by one module, and each status is changed by one module.
3. A status changes only by a conditional step from a named state, inside a transaction. An event is sent only after that transaction commits.
4. No work is started twice: a claim that did not change the row starts nothing.
5. At most one monster run is queued or running per process, one tick per process, and one run per process and item.
6. No two monster runs whose processes share a site are running at the same time.
7. An item is recorded as handled only by a passed run, in the same transaction, or as set aside by Resume.
8. A run's model-call count is the number the runner seam reported. The service never writes a constant in its place.
9. No tool or tool version is deleted, and no version folder is written twice.
10. No login is in the database, in the shelf, in a log, in an event or in any answer.
11. Only `PUT /invitation` changes the invitation and the logins.
12. An agent's report never moves a process forward. Only the service's own verification lines do.
13. Every repair monster run leaves exactly one repair record.
14. Every answer that is not a success is one sentence and a code, and changed nothing.
15. After recovery, no record is in a running state that nothing is working on.
16. A stand-in is replaced, never extended.

## Verification

The part is shown to work by two sets of checks: a test suite, and checks against the web app in real mode.

**Test suite** (`pnpm --filter @repo/lab test`). It runs against a separate test database on the same Postgres server, never the development one, and starts the real server on a free port. Where a state can only be reached through a seam, the test registers a scripted implementation of that seam in place of the stand-in; scripted implementations exist only in the test folder.

| Check                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every endpoint answers the `@repo/contract` type for its success, and `pnpm typecheck` passes with the handlers typed by the contract.                             |
| Every command refuses each state it is not allowed in, with the right code and one sentence, and changes no row.                                                   |
| With the stand-ins: a saved interview becomes `nothing_found`, and an `interview.status` event arrives.                                                            |
| With a scripted orchestrator: proposals are stored in order; an invalid proposal leaves a read error; removing a proposal works only while `proposed`.            |
| `PUT /invitation` stores sites and logins, keeps a login that is not sent, refuses a site nobody needs and a withdrawal of a site in use; the test password appears in no answer, no log line and no table. |
| Start refuses a missing site and a missing login by name, then queues one monster run per process, once.                                                           |
| Three processes, where the first two share a site and the third shares none: the first and third run together, the second starts only when the first has ended, and `waitsFor` names the first and the site. |
| Two dispatcher passes racing over the same queued work start it once.                                                                                              |
| With scripted seams: learn → verification lines → `awaiting_seal` → seal (examples stored, next run set) → run now → runs `passed` with the reported model calls → items handled → a second run now finds nothing new. |
| A failing install check or verification run ends in `failed_to_learn` with the line's sentence; learn again queues a new monster run.                              |
| A failed run queues one repair; a verified repair leaves a new current version, a repair record, an `after_repair` run and a `sealed`, repaired process; the old version is still on disk and in the table. |
| A repair that fails, and a refused run, each end in `needs_human` with the right cause; resume sets the item aside and it is never listed for a run again.         |
| Retire ends waiting work as specified and keeps tools and history.                                                                                                 |
| Restart: with a monster run, a run and a tick marked running, a fresh start settles each as the recovery table says.                                               |
| The event stream: ids rise; a client naming a last id receives the kept events after it; a heartbeat arrives within 15 seconds.                                    |
| Cross-origin: the preflight and the stream are allowed for a configured origin and not for another.                                                                |
| With `CURSOR_API_KEY` set and `LAB_AGENT_USE_API_KEY` unset, the agent environment does not contain it; with the setting on, it does.                              |

**With the web app in real mode.** Start everything with `pnpm dev:all`, with `NEXT_PUBLIC_LAB_MOCK=0` in `.env`. The "Simulated data" marker must be absent throughout.

| Step                                                                                         | Expected                                                                                                   |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Open the web app.                                                                            | The footer reads "The lab answers. Its database answers." Tonight shows four zeros and the empty shelf.    |
| Stop Postgres (`pnpm db:down`), wait, start it again.                                        | The footer reads "The lab answers. Its database does not.", then recovers by itself.                       |
| Stop the lab service, then start it.                                                         | The connection bar appears, then "The lab answers again."                                                  |
| On Interview, type a few lines and end the interview.                                        | "The transcript is being read." and then, with the stand-in orchestrator, "It heard no process in that."   |
| Open Reliquary, Invitation, Refused, the Lab.                                                | Each shows its empty state, read from the service, with no read error.                                     |
| Ask the service for a process that does not exist, from the Process page's address.          | "Nothing by that name lives here."                                                                         |
| Look at the `shelf` and `.lab` folders and at `git status`.                                  | Both exist, the shelf is empty, and neither is listed as a change.                                         |

The states beyond a read interview cannot be reached in real mode until parts 2, 4 and 5 replace their stand-ins; until then the test suite is their evidence.

## Authors

Filip Zitny, with Claude.
