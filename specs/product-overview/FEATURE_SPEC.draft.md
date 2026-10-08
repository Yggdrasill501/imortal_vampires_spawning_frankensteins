# imortal vampires spawning frankenstains — Product Overview Specification

> Purpose: The high-level specification of the whole product. It states what the product is, how a person uses it, what the parts are and the rules that always hold. Each part gets its own, more detailed spec (see “Spec Breakdown”).

## Overview

A person describes their daily work in a voice interview. From that interview the product proposes separate processes. For each process it spawns a **monster**: an agent that starts with no task tools, finds or creates the tools it needs, and performs the process once in a real browser. When the person confirms the result, the process is saved as a chain of tools that runs again on a schedule **with no AI model in it**.

When a saved tool later fails, a repair monster starts by itself, fixes only the broken tool, records what it did, and the process carries on. A monster can gain any number of new abilities, but it can never gain access to anything the person did not explicitly grant.

The product is for mid-size and large legacy companies. The user is a clerk who re-types the same details between email and old web systems. The buyer is the head of operations, who would otherwise pay consultants to map those processes and receive a document. This product delivers the working job instead of the map: tokens are spent once, when a monster learns or repairs, and never when the job runs.

## Product Integration

This is a new, standalone product. Nothing exists before it except the repository scaffold.

- **Web app (Next.js, `apps/web`)** is the only thing the user touches. It shows state and sends commands; it runs no agents and no tools, and it never touches the database. Health of the database is reported by the lab service.
- **Lab service (Node, Fastify)** is a separate process. It owns the database, the shelf, the invitation, the queue of work, the scheduler, the monsters and the runner. The web app talks only to this service.
- **Database (Postgres, `packages/db`)** holds records. Tool code is kept as files on disk in the shelf folder, which starts empty and is not part of the committed source.
- **Outside services:** ElevenLabs conducts the voice interview. The Cursor command-line agent is the brain of the orchestrator and of every monster; which model it uses is one setting. An existing Gmail connector gives read-only access to a mailbox.
- **Visual theme:** Castlevania vampire style (dark, blood red, bone, ember), taken from the castle design reference the user supplied; its firm and copy are placeholder and are not used. The castle artwork appears on the landing page only. Bats appear as light ambience on a few screens. The product uses themed names for its main ideas (see Terminology).

The product runs locally on one laptop for one user.

## Interaction Design

The experience should feel like watching something come alive and then quietly do your work at night: dramatic while it learns, calm and boring once it runs.

**Interview.** One large button starts a voice conversation. The agent asks how the person does their work, including how long each task takes and how often. The conversation is held in the person’s language. When it ends, the transcript appears on screen.

**Review and invite.** The product lists the processes it heard, each with a plain description, the sites it needs, how the person said they know it worked, and a schedule. Below is the invitation: every site and connector the processes need, each with a field for its login where one is needed. The person removes any process they do not want and presses one button to invite and start. Nothing has touched any site before this moment.

**The lab.** Each process shows a monster at work. Its actions stream in live (opened a page, filled a field, created a tool, tested a tool), next to the shelf, which fills as tools are created. Tools that were reused are visibly different from tools that were just created. Tokens spent so far are shown.

**Seal.** When a monster finishes, the process shows what it did on a second example, the value that proves it worked (for instance the new employee id), and the chain of tools it will use. The person presses Seal. A sealed process is live.

**Process page.** Status, schedule, a Run now button, and the list of runs. Every model-free run shows its outcome, its duration and “0 model calls.” A repaired process carries a visible “repaired” mark with a link to the repair record. A process that needs the person shows why, in one sentence, with a Resume button.

**Shelf.** Every tool: name, one-sentence description, the sites it touches, which monster created it, which processes use it, and its versions.

**Refused access.** Any attempt to reach a site outside the invitation appears as a red entry naming the site and what tried to reach it.

## Terminology

| Term         | User-Facing | DB/Code        | Definition                                                                                             |
| ------------ | ----------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| Interview    | Interview   | `interview`    | One voice conversation and its transcript.                                                             |
| Orchestrator | —           | `orchestrator` | The agent that turns a transcript into proposed processes. Its only ability is to propose processes.   |
| Process      | Process     | `process`      | One repeatable piece of work, saved as an ordered chain of tools plus a check.                         |
| Brief        | —           | `brief`        | What a monster is handed: description, sites, success criterion, schedule, examples.                   |
| Monster      | Familiar    | `monster`      | An agent that owns one process and creates or reuses tools for it. Also used for repairs.              |
| Tool         | Relic       | `tool`         | A small piece of code with one capability, created by a monster.                                       |
| Shelf        | Reliquary   | `shelf`        | The shared collection of all tools. Empty at the start.                                                |
| Starting kit | —           | `kit`          | The generic abilities a monster is born with. Contains no task tools.                                  |
| Connector    | Site        | `connector`    | An existing outside tool server (Gmail) that tools may call when invited.                              |
| Invitation   | Invitation  | `invitation`   | The sites and connectors the person has granted, with their logins.                                    |
| Seal         | Seal        | `seal`         | The person’s confirmation that a process’s result is correct.                                          |
| Check        | Proof       | `check`        | The value in a run that must be present for the run to count as passed.                                |
| Item         | —           | `item`         | One unit of incoming work, for example one email, with a stable identity.                              |
| Run          | Run         | `run`          | One model-free execution of a process for one item.                                                    |
| Monster run  | —           | `monster_run`  | One session of a monster: learning a process or repairing a tool.                                      |
| Repair       | Repair      | `repair`       | The record of a fix: what failed, on which input, what changed, the result.                            |

## User Roles & Permissions

There is one human role and no sign-in. The product is used by one person on their own machine.

| Actor        | May do                                                                                                                             | May never do                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| User         | Hold interviews; remove proposed processes; grant and change the invitation; seal; run now; resume; change a schedule; retire.     | —                                                                               |
| Orchestrator | Read a transcript; propose processes.                                                                                              | Touch any site; create tools; start monsters; change the invitation.            |
| Monster      | Search the shelf; create and test tools; explore invited sites in a browser; save a process; produce a repair.                     | Change the invitation; edit or delete another monster’s tool; seal a process.   |
| Runner       | Run sealed processes and verification runs; refuse uninvited requests; record runs.                                                | Call an AI model; change a tool; change the invitation.                         |
| Tool         | Use the browser page and the connectors it is handed, and the logins for the sites it declares.                                    | Reach anything else: other sites, files, the network directly, other programs.  |

**Starting kit.** A monster is born with: search the shelf, create a tool, run a tool, run a whole chain, and generic browser actions (open, click, type, read). It contains nothing specific to any task or site. The kit is listed openly in the README.

## User Flows

### Flow 1: Interview

**Entry Point**: The Interview button on the home screen.

**Preconditions**: None.

**Steps**:

1. The user starts the interview and describes their work by voice.
2. The interview agent asks follow-up questions: the steps, the systems used, how they know a task worked, how long it takes and how often.
3. The user ends the interview. The transcript is saved at once and the interview is shown as “being read.”
4. The orchestrator reads the transcript in the background and proposes processes. Each has a name, a description, the sites and connectors it needs, a success criterion and a schedule.

**Result**: The interview has a list of proposed processes. Nothing has run.

**Error Handling**: If the voice connection fails, the transcript so far is kept and the user can continue by typing into the same conversation. If the orchestrator finds no process, the screen says so and offers to continue the interview.

### Flow 2: Review and invite

**Entry Point**: The list of proposed processes after an interview.

**Preconditions**: At least one proposed process.

**Steps**:

1. The user reads the proposed processes and removes any they do not want.
2. The user fills in the invitation: confirms each site and connector, and gives a login where one is needed.
3. The user presses “Invite and start.”

**Result**: The invitation is stored. Each remaining process is queued for a monster.

**Error Handling**: A process that needs a site the user did not invite cannot be started; the button says which site is missing. Logins are checked only when a monster first uses them; a wrong login makes that monster fail with a clear reason.

### Flow 3: A monster learns a process

**Entry Point**: Automatic, when a process is queued.

**Preconditions**: Every site and connector in the brief is in the invitation.

**Steps**:

1. The monster receives its brief and the current contents of the shelf.
2. It decides which tools it can reuse and which are missing.
3. It explores the invited sites with its browser to learn the pages.
4. It creates each missing tool, small and with one capability, and tests it.
5. It saves the process as an ordered chain of tools with a check.
6. The service, not the monster, verifies the result: each new tool passes the install check, and the saved chain is run by the runner, with no model, on a second example.

**Result**: The process is awaiting the user’s seal. New tools are on the shelf. Tokens used are recorded.

**Error Handling**: If a tool fails the install check, or the chain fails when run without the monster, the process is marked as failed to learn, with the reason. The user can start the monster again. The monster’s own claim of success is never used as evidence.

**Order of monsters**: Processes that share no site run at the same time. Processes that share a site run one after another, in the order they were described, so that a later monster finds and reuses what an earlier one made.

### Flow 4: Seal

**Entry Point**: A process awaiting seal.

**Preconditions**: The service’s verification run passed.

**Steps**:

1. The user sees the verification run: the input, each tool’s result, and the proof value.
2. The user presses Seal.

**Result**: The process is sealed and its schedule is active. The inputs and results of the verification run are stored with each tool as recorded examples.

**Error Handling**: There is no reject action. An unsealed process never runs on a schedule; the user may retire it.

### Flow 5: A sealed process runs

**Entry Point**: The schedule, or the Run now button.

**Preconditions**: The process is sealed.

**Steps**:

1. The runner asks the process’s first tool for incoming items (for example new emails).
2. Items already handled are skipped.
3. For each new item the runner runs the chain in order, passing each tool’s result to the next.
4. If the check is present, the run passes and the item is recorded as handled.

**Result**: One run record per item, each showing 0 model calls. If there were no new items, the tick is recorded as “nothing new.”

**Error Handling**: A tool that fails stops that item’s run at that step; the item is not recorded as handled. Flow 6 begins. Other items in the same tick still run.

### Flow 6: Failure and repair

**Entry Point**: Automatic, when a run fails at a tool.

**Preconditions**: The failure was not a refused site (see Flow 7).

**Steps**:

1. A repair monster starts by itself. Its brief is the failed run: the step, the error, the input, the tool’s code, and past repair records for that tool.
2. It fixes the broken tool, creating a new version. Every other tool is reused untouched.
3. The service verifies the new version. A tool that only reads must reproduce its recorded examples and succeed on the failed input. A tool that writes to a site is verified on the failed item only, so that old entries are not created twice.
4. If verification passes, the new version becomes the current one, the failed item is run again, and the process is marked “repaired.”
5. A repair record is saved: what failed, on which input, what changed, and the result. The old version is kept.

**Result**: The process is sealed again, with a visible “repaired” mark, and goes back into scheduled use without waiting for the user.

**Error Handling**: If the monster cannot fix the tool, or verification fails, the process is marked “needs a human” with one sentence saying why, and its schedule is paused. Bad input, such as an email naming someone who does not exist, ends here and is not treated as a broken tool.

### Flow 7: Refused access

**Entry Point**: Anything tries to reach a site or connector outside the invitation.

**Steps**:

1. At install time: a tool that declares or names an uninvited site is not installed.
2. At run time: the browser request or connector call is refused before it leaves the machine.
3. The attempt is recorded and shown in red, naming the site and what tried to reach it.

**Result**: A run stopped by a refusal fails and the process is marked “needs a human.” It does not start a repair: a monster cannot repair its way to more access.

### Flow 8: Resume

**Entry Point**: The Resume button on a process that needs a human.

**Preconditions**: The process is in “needs a human.”

**Steps**:

1. The user reads the reason and deals with the stuck item by hand if it matters.
2. The user presses Resume.

**Result**: The stuck item is recorded as set aside and is never retried. The process returns to sealed and its schedule continues with the next items.

**Error Handling**: If the next item fails the same way, the normal failure path applies again (Flow 6 or Flow 7).

### Flow 9: Retire a process

**Entry Point**: The process page.

**Steps**:

1. The user presses Retire and confirms.

**Result**: The schedule stops and the process is hidden from the active list. Its tools stay on the shelf, and its run history is kept.

## Data Model

Records live in Postgres. Tool code lives as files on disk, one folder per tool version. Logins are kept by the lab service outside the shelf, outside the database and outside the committed source.

| Entity          | Holds                                                                                                              | Relationships                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Interview       | Transcript, language, start and end time, status (being read, proposed, nothing found).                            | Has many processes.                                   |
| Process         | Name, description, success criterion, required sites, schedule, next run time, status, chain of steps, check, repaired mark and latest repair, reason and cause when it needs a human, its verification run, its current monster run. | Belongs to an interview. Uses many tools. |
| Invitation site | Site or connector identity, whether a login is needed, when it was granted.                                        | Referenced by processes and tools.                    |
| Tool            | Name, description, declared sites, whether it reads or writes, creating monster run, current version.              | Has many versions. Used by many processes.            |
| Tool version    | Version number, location of the code, recorded examples (inputs and results), when it became current.              | Belongs to a tool.                                    |
| Monster run     | Kind (learn or repair), process, status, model used, tokens, tools created, tools reused, reason on failure, the ordered list of its actions and verification lines. | Belongs to a process. May produce a repair. |
| Run             | Process, item identity and label, kind (verification, scheduled, run now, after repair), status, duration, model-call count (always 0), each step’s result, proof value, failing step and error, refused sites, the repair it led to. | Belongs to a process. |
| Tick            | Process, time, how many new items were found (zero is recorded as “nothing new”).                                  | Belongs to a process. Has many runs.                  |
| Handled item    | Process, item identity, and whether it was handled by a passed run or set aside by the user.                      | Unique per process and item.                          |
| Repair          | Tool, old and new version, failed run, what changed, result.                                                       | Belongs to a tool and a monster run.                  |
| Refusal         | Site, what tried to reach it (tool, monster run or run), when.                                                     | Belongs to a run or a monster run.                    |

Constraints:

- A tool name is unique on the shelf. A tool is never deleted; versions are only added.
- A process’s sites must all be in the invitation. A tool’s sites must all be in the invitation and within the sites of every process that uses it.
- An item is recorded as handled only after its run passed the check.
- Tool code never contains a login.

## State Diagram

**Process**

```
proposed ──(invite and start)──▶ queued ──▶ learning ──▶ awaiting seal ──(seal)──▶ sealed
                                               │                                      │
                                               ▼                                 (a tool fails)
                                        failed to learn                               ▼
                                     (user starts again ▶ queued)                 repairing
                                                                                 │         │
                                                                         (verified)   (not fixed, or refused site)
                                                                                 ▼         ▼
                                                                      sealed, repaired   needs a human ──(resume)──▶ sealed

any state ──(retire)──▶ retired
```

- **proposed**: heard in an interview, nothing has run.
- **queued**: invited, waiting for a monster.
- **learning**: a monster is working.
- **awaiting seal**: verified by the service, waiting for the user.
- **failed to learn**: the monster’s result did not pass verification.
- **sealed**: live and scheduled.
- **repairing**: a repair monster is working; the schedule waits.
- **needs a human**: paused, with a reason. Resume sets the stuck item aside and returns to sealed.
- **retired**: stopped by the user.

**Run**: `pending → running → passed | failed | refused`.

**Monster run**: `queued → running → verified | failed`.

## API Surface

The lab service exposes these to the web app. Exact request and response shapes belong to the part specs.

| Action                        | Method and path                 | Effect                                                    |
| ----------------------------- | ------------------------------- | --------------------------------------------------------- |
| Health                        | `GET /health`                   | Reports that the service and its database are reachable.  |
| Save an interview             | `POST /interviews`              | Stores the transcript and returns at once; proposals follow as events. |
| Get an interview              | `GET /interviews/:id`           | Transcript, status and its processes.                     |
| Remove a proposed process     | `DELETE /processes/:id`         | Only while proposed.                                      |
| Read the invitation           | `GET /invitation`               | Sites and connectors; never returns logins.               |
| Grant the invitation          | `PUT /invitation`               | Sites, connectors and logins.                             |
| Start the monsters            | `POST /interviews/:id/start`    | Queues every remaining proposed process.                  |
| List and read processes       | `GET /processes`, `/:id`        | Status, chain, schedule, runs.                            |
| Start a monster again         | `POST /processes/:id/learn`     | Only from failed to learn.                                |
| Seal                          | `POST /processes/:id/seal`      | Only from awaiting seal.                                  |
| Run now                       | `POST /processes/:id/run`       | Only when sealed.                                         |
| Resume                        | `POST /processes/:id/resume`    | Only from needs a human. Sets the stuck item aside.       |
| Change a schedule             | `PUT /processes/:id/schedule`   | Daily at a time, or every N minutes.                      |
| Retire                        | `POST /processes/:id/retire`    | Stops the schedule.                                       |
| Read the shelf                | `GET /tools`, `/tools/:name`    | Tools, versions, examples, repairs.                       |
| Read runs and monster runs    | `GET /runs`, `/monster-runs`    | History, including refusals.                              |
| Live events                   | `GET /events`                   | A stream of monster actions, run results and refusals.    |

## Key Design Decisions

| Decision                                                                 | Rationale                                                                                                                         |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| A saved process is code that runs with no model.                         | Cost is paid once, when learning or repairing. Runs are repeatable, fast and cannot be talked into anything.                      |
| Monsters are born with a generic starting kit and no task tools.         | The track rule is that the team writes no task tools. Organizers confirmed generic primitives are allowed.                        |
| Tools are small, one capability each, on one shared shelf.               | Reuse across processes is the point of the track, and a repair replaces one small piece instead of a whole script.                |
| The service verifies everything; a monster’s word is never evidence.     | In testing an agent reported success for a file it had written to the wrong place.                                                |
| The orchestrator works on the finished transcript.                       | One path whether the words were spoken or typed, and no dependence on the voice agent calling our service live.                   |
| The human grants the invitation between the interview and the monsters.  | Access comes from a person, at one visible moment, and never from a conversation or an email.                                     |
| The invitation is enforced by the runner, outside the tools.             | A check written by the thing being checked proves nothing. The agent browser’s own site list is not a real boundary.              |
| Logins are held by the service and handed to tools at run time.          | A tool is shareable and inspectable without exposing a password.                                                                  |
| Processes sharing a site learn in order; others learn at the same time.  | A fixed rule, not a model’s choice, that makes reuse happen where it can and saves time where it cannot.                          |
| A run handles one item, and an item is handled once.                     | Daily work arrives as separate things. It prevents entering the same person twice.                                                |
| A repair starts by itself and goes live by itself once verified.         | The promise is that the work is kept while the person is not watching.                                                            |
| Writing tools are re-verified only on the failed item.                   | Replaying old examples against a live site would create duplicate entries.                                                        |
| A refused site never starts a repair.                                    | A monster must not be able to fix its way to more access.                                                                         |
| No reject action and no recording by demonstration in this version.      | One way to create a process: interview, monster, seal.                                                                            |
| Resume sets the stuck item aside instead of retrying it.                 | The item is what stopped the process. Retrying it would stop the process again; the person deals with that one by hand.           |
| Saving an interview returns at once.                                     | The orchestrator can take a minute or more; the screen shows progress instead of a hanging request.                               |
| The model is one setting.                                                | Build on whatever the plan accepts; switch to a stronger model for final runs without changing anything else.                     |

## Invariants

1. A run never calls an AI model.
2. Nothing reaches a site or connector that is not in the invitation.
3. Only the user changes the invitation, and only through the invitation form, which appears on the review screen and on the invitation screen.
4. No task tool exists before a monster creates it. The shelf starts empty.
5. No tool contains a login.
6. A process runs on a schedule only after the user sealed it, or after a verified repair of a process that was sealed.
7. Evidence of success always comes from the service running the saved chain, never from an agent’s report.
8. A tool is never deleted or overwritten; a change is a new version, and the old one is kept.
9. An item is recorded as handled only after its run passed the check, or when the user set it aside with Resume.
10. Every fix leaves a repair record.

**Stated limits of this version**

- While a monster is learning or repairing, it is a coding agent on the user’s machine. The invitation fully binds its browser, every saved tool and every run; it does not confine the monster’s own session. This is not a sandbox.
- A change in what a page means, as opposed to how it is laid out, can pass the check.
- A run that fails after a writing step leaves that step’s entry in place.
- The prompts and starting kit are tuned for the reference scenarios. Nothing about those scenarios is built into the product.
- One user, one machine, no sign-in.

## Reference Scenarios

The product is tuned for, and demonstrated with, one persona doing three processes. They are examples, not features.

Persona: a night-shift HR clerk at a large legacy company. Systems: a Gmail mailbox (read-only), the OrangeHRM demo, the ParaBank demo.

| #   | Process                                                        | Expected reuse                                |
| --- | -------------------------------------------------------------- | --------------------------------------------- |
| 1   | New-hire email → employee record in OrangeHRM.                 | None; the shelf is empty.                     |
| 2   | Newly added employee in OrangeHRM → account in ParaBank.       | OrangeHRM login and employee lookup.          |
| 3   | Leaver email → end of employment in OrangeHRM.                 | Email reading, OrangeHRM login and lookup.    |

Emails have a fixed layout. Changing that layout is the planned failure that shows a repair.

## Spec Breakdown

Each part below gets its own spec. The order is the build order.

1. **Lab service and data model** — the Fastify service, the records, the queue, live events.
2. **Shelf, tool contract and runner** — what a tool is, the install check, the model-free runner, items, the check.
3. **Invitation** — sites, connectors, logins, enforcement and refusals.
4. **Monster** — the starting kit, the brief, learning, verification, repair.
5. **Interview and orchestrator** — the voice conversation, the transcript, proposing processes.
6. **Scheduling** — schedules, ticks, run now.
7. **Web app** — the screens above in the vampire theme.
8. **Reference scenarios and submission** — the three processes, the demo, the evidence, the README.

## Authors

Filip Zitny, with Claude.
