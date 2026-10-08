# @repo/contract

The contract between the web app (`apps/web`) and the lab service: types and a
few constants, nothing else. TypeScript source, consumed directly; there is no
build step.

**Do not change this casually.** Both sides are built against these files, by
different hands, at the same time. A change here is a change to both. If a
shape must change, change it here first, say so, and update the web app's two
clients (`apps/web/src/lib/lab/http.ts` and `apps/web/src/lib/lab/mock/`) and
the lab service in the same step.

| File              | Holds                                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `src/entities.ts` | Entities and statuses from the product overview's Data Model and State Diagram.                      |
| `src/api.ts`      | Paths, request and response shapes for every endpoint in the overview's API Surface, and `ApiError`. |
| `src/events.ts`   | The live events sent on `GET /events` (server-sent events, one JSON `LabEvent` per message).         |

Rules the shapes rely on:

- Names use the overview's code words: `monster`, `tool`, `shelf`, `check`. The themed names (Familiar, Relic, Reliquary, Proof) exist only in the web app.
- Times are ISO 8601 strings in UTC. Durations are milliseconds.
- `GET /invitation` never returns a login. `PUT /invitation` takes the complete set of sites; a site sent without a login keeps the one already held.
- `POST /interviews` returns at once with status `being_read`; the proposals follow as an `interview.status` event.
- A refused command answers non-2xx with `{ error, code }`, where `error` is one sentence fit to show the user. `state_changed` is HTTP 409.
- A run's `modelCalls` is reported by the runner. The web app prints what it is given.
- Events say what to read again. A status on screen always comes from a read.
- The lab service must allow cross-origin requests from the web app's origin, including `GET /events`.
