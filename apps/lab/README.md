# Lab service

Fastify service on `http://localhost:4000`. It owns interviews, processes, invitation, runs, and events. The web app talks only to this API.

Postgres lives in Docker on host port `5434`. Schema and migrations are in `packages/db`. Logins stay in `.lab/logins.json`, never in the database.

Orchestrator, monster, runner, shelf install, and scheduler are stand-in seams for now. A saved interview with no real reader becomes `nothing_found`.

## Run

From the repo root:

```sh
pnpm db:up
pnpm db:migrate
pnpm --filter @repo/lab dev
```

`pnpm dev` and `pnpm dev:all` also start this package. `GET /health` answers `{ "service": "ok", "database": "ok" }` when Postgres is up and migrated.

```sh
pnpm --filter @repo/lab test
pnpm --filter @repo/lab typecheck
```

Service tests use `imortal_vampires_spawning_frankenstains_test` on the same Docker Postgres. They do not open a browser.

## Standalone runner

The shared shelf contract and the model-free runner still run without the HTTP server:

```sh
pnpm --filter @repo/lab runner fixture --url "$ORANGEHRM_URL"
pnpm --filter @repo/lab runner fixture --url https://www.google.com --allow your-orangehrm-host.example
```

The first command opens an invited page and returns its title. The second must return `refused`. Set `LAB_HEADLESS=1` to hide the browser window.
