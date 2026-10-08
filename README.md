# imortal-vampires-spawning-frankenstains

Turborepo monorepo: Next.js + React + Tailwind on the front, Postgres + Kysely for data. The web app talks only to the lab service (not built yet) and, until that exists, to an in-browser simulation of it.

## Layout

- `apps/web` — Next.js app (App Router, Tailwind v4)
- `packages/contract` — the types the web app and the lab service share (`@repo/contract`); do not change casually, see its README
- `packages/db` — Kysely client, migrations and generated schema types (`@repo/db`)
- `packages/typescript-config` — shared `tsconfig` base

## Setup

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

The web app has no database access and no health route of its own. It shows the lab service's health (`GET /health` on the lab service) in the footer of every screen. `pnpm dev` alone is enough to run the web app; the database is only needed by the lab service.

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

## Scripts

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

## Environment

A single `.env` at the repo root is shared by the web app (loaded in `apps/web/next.config.ts`) and the db tooling.
