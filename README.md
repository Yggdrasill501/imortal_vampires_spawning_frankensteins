# imortal vampires spawning frankenstains

Hackathon entry for the Frankenstein topic: an agent that builds its own capabilities, tests them, installs them and uses them again later.

## Against the assignment

What it is: a person describes their daily work in a voice interview. For each task, one agent (a "monster") starts with no tool for it, looks at a shared shelf, reuses what fits and writes what is missing, in a browser you can watch. The lab tests the result itself. Once you seal it, the task reruns on a schedule as a chain of those tools with no AI model, and a tool that breaks is repaired by a new monster. Its capabilities grow with every task; its access does not: it only enters where it is invited.

### The four hard rules

| Rule | Status | How |
| --- | --- | --- |
| Generated code runs in a sandbox, never on a host holding your credentials | **Partly met** | Every tool, in every test, check, run and rerun, executes in a worker process started inside the macOS system sandbox (`apps/lab/src/runner/sandbox.ts`, tested in `sandbox.test.ts`). The profile denies it the project's `.env`, the lab's held logins, the usual credential folders in the home directory, and every write outside scratch space. A tool is handed only its input, the login for the sites it declared, and its connectors. Not met: it is the same machine, not a container; the profile is a deny-list; it exists on macOS only, and elsewhere the worker is an ordinary process. The monster's own agent session is not sandboxed at all. |
| No install without passing tests; the test run is visible in the log | **Met, with one detail** | A tool is placed on the shelf after a static check so that the lab can run it. The lab then runs the whole chain on a second example with no model. If that run fails, every tool that monster created is removed again. The check lines and the run are shown on the process page. |
| The gap comes from a task | **Met** | Tasks come from the interview. No code names a tool to build or a site to build it for. The shelf starts empty; see it before the first run on the Reliquary page. |
| Self-iterations and spend per run are capped in code | **Partly met** | Capped: 20 minutes per monster (`LAB_MONSTER_TIMEOUT_MS`), 3 learn attempts and 3 repairs per process (`LAB_MAX_ATTEMPTS`), 3 monsters at once, 120 seconds per run. Not capped: tokens. The agent reports them only when a session ends, so they are recorded, not limited. |

### The definition of done

| Asked for | Status | Where |
| --- | --- | --- |
| A task exposes a missing capability; the agent creates, tests and registers it, then completes the task | Met | Learning a process from an empty shelf |
| A fresh session, on a different task, combines earlier capabilities without rebuilding | Met | Each monster is a new session. The second process reuses the sign-in tool the first one made |
| A persistent registry with versions and rollback | Partly | Every tool keeps every version. A failed repair is rolled back automatically. There is no button to roll back by hand |
| The agent builds its own discovery and management tooling | Not met | The agent writes each tool's description and interface, which is what the shelf search reads. The shelf and its search are ours |
| An approval gate, operator control | Met | Nothing runs on a schedule until you seal it. You invite sites, set the schedule, resume and retire |
| Eyes, hands or a voice | Met | A browser it drives; an ElevenLabs voice interview |

## Starting kit list

The team wrote no task tools, and the shelf starts empty. This is everything a monster is born with; none of it is specific to any site or task:

- **Read the shelf** — list every tool: name, description, sites, input, output (`./kit shelf`)
- **Search the shelf** by words (`./kit search <words>`)
- **Create a tool** — write `tools/<name>/meta.json` and `tools/<name>/tool.mjs`
- **Test a tool** on one input (`./kit test <tool> '<input json>'`)
- **Run a draft chain** on one item (`./kit chain`)
- **Generic browser actions** — open, click, type, read the page

The kit is in `apps/lab/src/monster/kit.ts`, and the words a monster is handed with it are in `apps/lab/src/monster/briefs.ts`.

## Stack

Turborepo monorepo. The web app talks only to the lab service; with the service off it shows an in-browser simulation, marked "Simulated data". Turborepo and pnpm; Next.js (App Router), React and Tailwind v4 in `apps/web`; Fastify and Playwright in `apps/lab`; Postgres in Docker with Kysely for queries, migrations and schema types in `packages/db`.

## The real / simulated / missing table

"Real, not yet run end to end" means the part is connected in the lab service and covered by tests, but a full night on the real systems has not been recorded yet.

| Feature | Status | Notes |
|---------|--------|-------|
| Web app screens and routes | Real | Next.js frontend |
| Database | Real | Postgres with Kysely schema and migrations |
| Lab service core | Real | Fastify service: interviews, processes, invitation, runs, ticks, events |
| Mock mode data | Simulated | By default the web app uses an in-browser simulation kept in `sessionStorage`, marked "Simulated data" |
| Test emails | Simulated | Sent by `scripts/send-test-emails.mjs` to a throwaway mailbox |
| Runner (runs a chain with no model) | Real | `apps/lab/src/runner`. Runs every saved chain, the lab's own check after learning, and the rerun after a repair. Covered by tests, including one through the service. |
| Install check (shelf) | Real | `apps/lab/src/shelf`. Every tool a monster writes passes it before it is installed. |
| Monster (learns and repairs) | Real, not yet run end to end | `apps/lab/src/monster`, driven through the `cursor-agent` command. Proven standalone on the HR system (learn, reuse, repair); connected to the service, where its path is tested with a scripted agent. |
| Scheduling | Real | `apps/lab/src/scheduling`: daily at a time, or every N minutes. |
| Orchestrator (reads the interview) | Real | `apps/lab/src/orchestrator`: one read-only agent call that turns a transcript into proposed processes, limited to the configured systems. |
| Mailbox connector | Real | `apps/lab/src/connectors`: read-only search and read over IMAP. Anything but those two actions is refused. |
| Mailbox | Simulated | A local mail server in Docker (`docker-compose.yml`), filled by `scripts/send-test-emails.mjs`. The connector reads it over the same protocol a real mailbox uses; pointing it at Gmail needs only an app password in `.env`. |
| ElevenLabs voice interview | Real, needs configuration | The web app has the voice client; it is off until an agent id is set, and typing still works |

## Layout

- `apps/web` — Next.js app (App Router, Tailwind v4)
- `apps/lab` — Fastify lab service on `http://localhost:4000`, plus the standalone runner
- `packages/contract` — the types the web app and the lab service share (`@repo/contract`); do not change casually, see its README
- `packages/db` — Kysely client, migrations and generated schema types (`@repo/db`)

## How to run

```sh
nvm use                 # Node 24, from .nvmrc
corepack enable         # pnpm version comes from package.json
pnpm install
cp .env.example .env
pnpm db:up              # Postgres in Docker on localhost:5434
pnpm db:migrate
pnpm dev                # http://localhost:3000
```

After the first setup, one command starts everything:

```sh
pnpm dev:all            # Postgres, migrations, then every app in dev mode
```

`pnpm dev:all` runs `pnpm db:up`, `pnpm db:migrate` and `pnpm dev` in that order and stops at the first one that fails. It is safe to run while Postgres is already up. Because it ends in `turbo run dev`, any package that later gains a `dev` script (for example the lab service) is started by it with no change to the script. It needs Docker running and Node 24.

The web app has no database access and no health route of its own. It shows the lab service's health (`GET /health` on `http://localhost:4000`) in the footer of every screen. `pnpm dev` starts the web app and the lab service. The database is required by the lab service.

### Scripts

| Command                       | What it does                                             |
| ----------------------------- | -------------------------------------------------------- |
| `pnpm dev`                    | Run all apps in dev mode                                 |
| `pnpm dev:all`                | Start Postgres, apply migrations, then run `pnpm dev`    |
| `pnpm build`                  | Build everything                                         |
| `pnpm lint`                   | ESLint                                                   |
| `pnpm typecheck`              | TypeScript across the workspace                          |
| `pnpm format`                 | Prettier                                                 |
| `pnpm db:up` / `pnpm db:down` | Start / stop Postgres                                    |
| `pnpm db:migrate:make <name>` | Create a migration in `packages/db/migrations`           |
| `pnpm db:migrate`             | Apply pending migrations                                 |
| `pnpm db:migrate:down`        | Roll back the last migration                             |
| `pnpm db:codegen`             | Regenerate `packages/db/src/schema.ts` from the database |

After changing the schema: `pnpm db:migrate && pnpm db:codegen`.

## Web app

Routes: `/` (Tonight, the landing page with the castle), `/interview`, `/interviews/[id]` (review and invite), `/lab`, `/processes/[id]`, `/processes/[id]/runs/[runId]`, `/reliquary`, `/reliquary/[name]`, `/invitation`, `/refused`.

Every screen reaches the lab service through one client interface (`apps/web/src/lib/lab/client.ts`) with two implementations:

- **mock** (default): an in-browser simulation seeded with the reference scenarios. No service needs to run. A "Simulated data" marker is shown on every screen; it also lets you start a scenario again or cut the line to the lab to see the dropped-connection state. The made-up records live in the browser tab (`sessionStorage`) and survive a reload.
- **http**: the real lab service. Set `NEXT_PUBLIC_LAB_MOCK=0`.

Mock scenarios, chosen with `?mock=` on any URL and remembered for the tab:

| URL            | Starts with                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `/?mock=empty` | Nothing at all: the first run, Reliquary empty. Type an interview (eight words or more) to hear three processes.                            |
| `/?mock=story` | The default. One interview that is being read; about seven seconds later its three processes are proposed.                                  |
| `/?mock=full`  | A night already behind us: sealed and repaired, needs a human, awaiting a Seal, a Familiar learning live, queued, failed to learn, retired. |

Playing the story in the mock: invite and start → watch the Lab → "Review and seal" → Seal → "Run now" three times on the first process (a pass, then a failure that repairs itself, then a refused site that needs a human) → Resume. In the simulated interview, fewer than eight typed words gives "It heard no process in that", and a line containing "cannot be read" gives the could-not-read state.

| Variable                          | Default                 | Meaning                                                                        |
| --------------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_LAB_MOCK`            | on (unset or `1`)       | `0` turns the simulation off and calls the lab service.                        |
| `NEXT_PUBLIC_LAB_URL`             | `http://localhost:4000` | Address of the lab service. It must allow requests from the web app's origin.  |
| `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` | unset                   | Public ElevenLabs agent id. Unset: the voice button is disabled, typing works. |

`NEXT_PUBLIC_*` values are read when the app is built or the dev server starts, so restart after changing them.

## Environment

A single `.env` at the repo root is shared by the web app, the lab service and the db tooling.
