# imortal-vampires-spawning-frankenstains

Turborepo monorepo: Next.js + React + Tailwind on the front, Postgres + Kysely for data.

## Layout

- `apps/web` — Next.js app (App Router, Tailwind v4)
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

`GET /api/health` runs a query against the database.

## Scripts

| Command                       | What it does                                             |
| ----------------------------- | -------------------------------------------------------- |
| `pnpm dev`                    | Run all apps in dev mode                                 |
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
