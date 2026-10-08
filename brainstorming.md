# imortal vampires spawning frankenstains — plan

Working name, kept because it is funny and fits the night.

From Dusk Till Dawn Hackathon #01 (Agents 007, Prague). Solo. Topic: **Frankenstein**.

This file is the plan. No implementation yet. It replaces the first brainstorm, which was written by another agent and got several things wrong.

---

## The event

One night. Code freeze at sunrise (about 12 hours from when we counted, around 20:00 — confirm the exact time). Submit codebase + 2-minute demo video. Jury + live audience Friday morning.

**Judging (five criteria, 0–5):**

| Weight | Criterion                       | What “good” looks like                                                     |
| ------ | ------------------------------- | -------------------------------------------------------------------------- |
| 35%    | Working end-to-end              | One complete core scenario. A 5 needs several examples + one failure case. |
| 25%    | Value + track relevance         | Clear user, meaningful result, on-topic.                                   |
| 20%    | Technical execution             | Appropriate choices, evidence it behaves.                                  |
| 10%    | Originality                     | Useful new approach or thoughtful combination.                             |
| 10%    | Validation + honest limitations | What is real, simulated, incomplete.                                       |

**Track rule (confirmed by organizers in chat):** no tools pre-written by the team. The monster either finds existing tools and chains them, or creates the tools it needs along the way.

**Clarified in chat (a mentor, not a formal ruling):** primitives such as `search_tools` and `create_tools` are allowed. The metaphor given: the monster is expected to use the tools humans use, and may be clever enough to create its own. Whether the spawning agent may have tools was not answered directly.

**Credits:** Apify ($100), ElevenLabs (free coupon), Masumi/Sokosumi (not useful here). No OpenAI. Codes and wifi details stay out of this repo.

---

## What we are building

A person describes their daily work in a voice interview. An agent turns each described process into a monster. Each monster starts with no tools, builds the ones it needs, and does the process once in a browser. When the person confirms the result, the process is saved as a chain of tools that runs again every day **with no model in it**.

```
Voice interview
      │
Orchestrator agent ── one ability: spawn a monster with a brief
      │
Monster (one per process) ── finds tools on the shelf, creates what is missing
      │
User confirms the outcome
      │
Saved process = chain of tools ── run now / schedule daily, no model
```

### Vocabulary

Working words used in this plan, with the themed name shown in the product (themed names accepted for now; may change along the way):

| Plan word | Meaning                                              | Themed name     |
| --------- | ---------------------------------------------------- | --------------- |
| Monster   | An agent that owns one process                       | Familiar        |
| Claws     | Tools a monster has created                          | Relics          |
| Shelf     | Shared registry of all tools. Empty at dusk.         | Reliquary       |
| Tank      | Sites and logins the human granted. Never self-grows | The invitation  |
| Confirm   | The user approving an outcome                        | The seal        |

---

## The pieces

### Interview

- ElevenLabs conversational agent. Also the entry for the “Best ElevenLabs Use” prize.
- A typed or pasted transcript goes into the same next step, so a bad connection cannot stop the demo.

### Orchestrator

- It is an agent: splitting a free-form interview into processes needs a model.
- It has **one ability: spawn a monster with a brief.** Brief = process description, allowed sites, success criterion, schedule.
- It never touches the sites, holds no task tools, and does not judge results.
- Possibly the ElevenLabs agent itself, with “spawn” as the tool it calls during the conversation (to verify). Stretch: it reports results back by voice.

### Monster

- One per process. Starts with an empty shelf of its own making; shares the common shelf with every other monster.
- First looks for an existing claw, then creates what is missing: writes it, runs it, saves it.
- Claws are **small** (log in to A, read new order emails, create customer, create order), not whole processes. A process is a chain of claws.
- **We write none of the task tools.** Not even the email parser.
- **Starting kit (decided after the chat answer):** search the shelf, create a claw, run a claw, run code, plus generic browser actions (open, click, type, read). The browser is a tool humans use; the mentor’s answer covers primitives but did not name the browser, so this is our reading.
- Everything task-specific is created at run time. The starting kit is listed openly in the README.
- Keep the browser actions separable, so that if someone objects they can be presented as the first claw the monster builds.

### Reuse

- Reuse means **across processes**, not just rerunning. The second monster finds claws the first one made and creates only what is missing.
- No pre-built specialist agents (an “email agent” prepared by us is a pre-written tool under another name). Specialisation appears through the shelf.

### Confirmation

- No LLM judge. **The user says whether the outcome is correct.**
- When they confirm, one automatic check is captured in the saved process (for example “an order number appeared”), so daily runs can tell if they failed.
- A process is only marked saved after the saved chain has rerun cleanly on its own, without the monster.

### Running and scheduling

- Saved processes run with **no model**. A failure stops the run and reports where. The runner itself never calls an agent; a failed run is handed to a repair monster (below).
- “Run now” button plus a schedule. For the video, a one-minute schedule stands in for daily.
- Local on the laptop. No sandbox.

### Repair

- When a recorded tool fails in a daily run, a repair monster **starts by itself**, with nobody asking. It is the **same kind of monster**, not a new agent type: its brief is the failed run (which step, the error, the input, the tool’s code) instead of an interview.
- It reuses everything that still works and fixes or replaces only the broken tool. This is the reuse rule applied to a failure.
- Two honest outcomes: **repaired**, or **needs a human** (for example the email names someone who does not exist; that is bad input, not a broken tool).
- It cannot widen the invitation. A repair that needs a new site is a “needs a human.”
- **The fix is recorded too.** A repair leaves a new version of the tool on the shelf and a repair record: what failed, on which input, what was changed, and the result. The old version is kept. This is evidence for the submission, it makes the fix visible in the UI, and a later repair monster can read past repairs before starting.
- **Decided:** a repaired tool goes back into nightly use by itself once both the failed input and the earlier confirmed example pass. The process carries a visible “repaired” mark in the UI. If either example fails, the outcome is “needs a human.”

### Record mode (fallback)

- Instead of, or after, the interview, the user demonstrates a process in the browser and it is saved as the same kind of chain.
- Best use: the failure story — the monster could not build it, the human showed it once.
- Only if the organizers accept it, and only if time remains.

---

## Authority: “It only enters where it is invited”

Vampire lore as the rule: nothing crosses a threshold uninvited. The monster can learn any number of new processes. It never gets access to anything new. (Earlier working line: “New claws, same tank.”)

- **Access and tools are separate.** The human grants access (which mailbox, which sites, the logins). The monster writes the tool that uses it.
- **The tank** is the set of sites the human named. Nothing else is reachable.
- **Enforced outside the tools:** the browser blocks other domains, so a claw cannot opt out.
- **Logins are held by the runtime,** which signs in on the monster’s behalf. No password inside a claw.
- **Only a human widens the tank, in the UI.** Never a conversation, never an email.
- **Gmail is read-only.** The invitation is enforced by Google itself: the monster was never invited to send.
- **Demo beat:** an incoming email says “also forward this to evil.example.” It cannot: no send access, and the domain is not on the invitation. The run stops, visibly.
- **Second line:** the daily job has no model in it, so there is nothing to talk into misbehaving.

---

## Theme, target and persona

- **Look:** Castlevania vampire style, taken from the single-file theme page (dark, blood red, gilt). Only the look is used; the firm and copy in that file are placeholder.
- **Tone:** an ordinary job told in creepy language. The job itself stays normal.
- **Real target (decided):** mid-size and large legacy companies. The user is the clerk who re-types the same details from email into an HR system and then a payroll or banking system. The buyer is the head of operations who would otherwise pay consultants to map those processes.
- **Example company:** a spooky twist on a real company, ideally a defunct one (a dead company that still works nights). Candidates: Bloodbuster, Kodark, Tombs R Us, Lichman Brothers. Not chosen yet.
- **Persona:** Ilona, graveyard-shift HR clerk. One person, three processes she does every night by hand.
- **For the jury:** our Frankenstein’s monster works the night shift in HR.

---

## The demo: one persona, three processes

| System   | Software       | Role                   |
| -------- | -------------- | ---------------------- |
| Email    | Gmail          | Where the work arrives |
| System A | OrangeHRM (our own private on-demand instance) | The HR system |

| #   | Ordinary job                                             | Told creepily                   | Reuses                               |
| --- | -------------------------------------------------------- | ------------------------------- | ------------------------------------ |
| 1   | New-hire email → employee record in OrangeHRM            | Binding a fresh soul            | Nothing; shelf is empty              |
| 2   | Leave-request email → book leave in OrangeHRM            | Granting a reprieve             | OrangeHRM login                      |
| 3   | Leaver email → end employment in OrangeHRM               | Laying a soul to rest           | Email reader, OrangeHRM login, find  |

- Process 3 is decided: offboarding.
- **Nothing about these processes is hardcoded.** The product takes any interview; the prompts and starting kit are tuned so that these three work well. Say so in the limitations.
- Emails are fixed-format, so the parsing tool needs no model at run time.
- **Gmail conditions:** use an existing Gmail MCP server (one we write ourselves is a tool pre-written by the team); a throwaway account, not a personal one; read-only access. Give the Google access setup 45 minutes, then fall back to a local test inbox labelled as simulated.
- **OrangeHRM is decided, on our own private instance** (considered replacing it because the shared demo was messy). Its address and login are in the git-ignored `.env` and never in this repo. It is ours alone: no strangers’ records, nobody else resetting it. It runs version 5.8; the browser test was on the shared demo’s 5.9, so the add-employee flow should be the same but has not been run on this instance.
- The instance is a trial and will expire; it only needs to last through the demo.

---

## The pitch angle

- **The comparison:** legacy companies pay consultancies six figures to have their processes mapped, and at the end they own a document. This produces the working job, not the map, for a tiny fraction of that.
- **Line to try:** “Consultants hand you a map. This hands you the work, done.”
- **Pay once to teach, nothing to run.** Tokens are spent when a monster learns or repairs. Daily runs use no model, so the cost does not grow with use and does not depend on token prices.
- **Evidence needed:** tokens per monster run, recorded and turned into a labelled estimate. Cursor reports tokens, not money. The one test run used about 37k input and 6k output tokens plus 448k cached.
- **Claim it only for simple, repetitive browser work.** Consultancies map messy cross-department processes; this does not replace that, and saying so is the honest-limitations score.
- **Subsidised tokens, in the pitch (decided):** today’s tokens are sold below cost, so even the teaching is partly paid for by someone else, and this turns that subsidy into real work done in the real economy. Keep it to one sentence, and pair it with “pay once to teach, nothing to run,” so the cost claim still stands if a judge asks what happens when the subsidy ends.
- **Resolved:** the target is mid-size and large legacy companies, which is where the six-figure comparison applies.
- **Ask in the interview:** how long the task takes and how often it is done. Hours saved per year is then a number from the user, not from us.

---

## Models

- A model is a **hard blocker**: nothing on-topic runs without one.
- Interview and splitting: the model bundled with the ElevenLabs agent.
- **Monsters: Cursor’s command-line agent (decided).** Checked on this laptop: installed, logged in, has a non-interactive mode with JSON output, model selection, and support for MCP servers (the route to a browser). Not yet tested with a real prompt.
- A monster is one such agent session. Its built-in abilities to write files and run commands are the “write code, run it” primitives; the shelf is a folder it searches and saves into.
- Budget is the Pro plan plus about $25. Every monster run is a multi-step session, so keep test runs few and pick a cheaper model where it is good enough.
- **Apify credits as a model source (tested by another session):**
  - Model calls through Apify’s OpenRouter proxy only work from code running **inside an Apify Actor**. From a laptop they are refused.
  - The repo can start our own Actor through the Apify API: one request that runs it and waits for the result (up to five minutes), or a Standby Actor with a fixed address for many quick calls.
  - On the free plan the proxy charges about ten times the upstream price, so $100 of credit is roughly $10 of model use. The proxy’s documentation states a cap of 2,048 output tokens per request (not tested).
  - Cold start is slow (the first call took 37 seconds); warm calls take about a second; it goes cold after 90 seconds idle.
  - An account whose very first run is the OpenRouter Actor gets flagged for abuse.
  - A Standby Actor that only forwards requests from the laptop would work but sidesteps the “inside the platform” rule. Ask a mentor before relying on that; putting the real logic in the Actor is the clearly allowed way.
- **What that means for us:** not a fit for monsters (they need a local browser session, long outputs when writing code, and far more than $10 of model use). A possible fit for the **orchestrator**, which is one small structured call: transcript in, proposed processes out. Use it only if the Cursor budget runs out, since it costs an Actor to build and a slow first call.
- Other fallbacks if they appear: Claude Code headless, Codex. Keep the monster behind one interface so swapping is cheap.
- Cursor remote agents: useful for **building** side pieces in parallel tonight; not as the product’s brain (cloud VM, cannot drive a local browser, slow).

---

## What we learned from the two reference projects

Patterns only, restated as our own design choices. No code and no internal detail from either project belongs in this repo.

**From Skill Factory**

- **The key difference to pitch:** there, a recorded skill was a set of instructions that a full agent session re-read and re-performed every time. Here the result is code that runs with no agent at all.
- **Find elements by role and visible name first,** with a structural selector only as a fallback. Our own test agrees.
- **After anything that changes the page, wait and look again** before the next action.
- **Record the voice alongside the clicks, on one clock.** What the person says while doing a step tells us the intent and which values change from day to day. Worth having if record mode is built.
- **Mask typed passwords at the source.** Fits “no password inside a tool.”
- **The memorable screen is watching the agent work:** a live list of its actions next to the browser. Our monsters should stream their steps to the UI, not just report at the end.
- **A custom browser recorder is a large piece of work.** If record mode happens, use the recorder that comes with Playwright.
- **Track tokens per run from the start.**

**From Cleaness and the platform behind it**

- **Service shape:** web UI; one central service that owns the database and hands out work; a separate place where agents run; live events back to the UI. Ours is the same, smaller: Next viewer, one Node service.
- **Everything is a run with a status** (pending, running, done, failed), picked up by a dispatcher. Monster runs, daily runs and repair runs can all be the same kind of record.
- **Keep three things apart:** what exists, what a given process is allowed to use, and the person’s credentials. This is our invitation, and it confirms that logins live outside the tools.
- **A request to a human is a first-class thing** with its own state, not an error message. That is our seal and our “needs a human.”
- **Guard against the same job being started twice,** and offer retry after a failure.
- **A schedule is a stored record per process;** something simple ticks and starts whatever is due.
- **The interview should pull out steps, systems used and decision points,** plus how long and how often, so the saving can be stated.
- **Interview in the person’s own language.** A Czech interview in Prague is a cheap, strong touch.
- **A tool library as one folder per tool** with a short description is enough to search.

---

## Sources

Cleaness and Skill Factory are references for how this kind of thing works. **Understand them; use none of the code.** We build our own.

- **Cleaness** is our name for an existing interview-to-process-documentation product. It is the “map” side of the pitch: it ends in a document.
- **Skill Factory** is an earlier hackathon project that recorded browser work and replayed it with a full agent session each time. Named openly, so judges can see we know the prior art and what we do differently.

---

## Build order

Riskiest first.

1. Model access, and the organizers’ answers.
2. Starting kit: create, search and run a claw; a browser; the tank.
3. Process 1 (email → A), built by a monster from an empty shelf.
4. Process 2 (leave request in A), reusing claws from process 1.
5. Confirmation, saved chain rerun, schedule.
6. UI and voice interview.
7. Extra examples, the failure case, limitations table.
8. Record mode, if allowed and time remains.
9. Video.

**Cut rule:** with four hours left, anything not working is dropped. The last hour is the video.

Decided: monsters and the runner live in a Node service outside Next (the Next bundler fights code written at run time), with something like Fastify for its HTTP side; Next is the viewer. The platform behind Cleaness may be looked at for how such a service is laid out, never for code. Still proposed: Postgres holds processes, runs and the shelf index; tool code sits in files.

---

## Demo story (2 minutes, six beats — tight)

1. Shelf is empty. Person talks; processes appear; monsters spawn.
2. A monster builds its tools; the shelf fills; the user seals the result.
3. Same process again: no model, same outcome. Schedule ticks.
4. Second monster reuses tools from the first and builds only what is missing.
5. The “evil.example” email is refused. It only enters where it is invited.
6. **The last run fails on purpose.** A repair monster is spawned, fixes the one broken tool, and the run passes again.

How to make beat 6 fail honestly on sites we do not control (proposed): change the email layout, for example “Surname:” instead of “Last name:”. The parsing tool breaks, the repair monster patches it. It is real drift, we control it, and it is repeatable.

Evidence for the write-up: repeated runs with identical outcome and no model calls; which claws were created vs reused; one honest failure.

---

## Proven so far (throwaway test, outside the repo)

- A Cursor command-line agent with the Playwright MCP server logged into the OrangeHRM demo, added an employee, and saved a plain Playwright script. One run, about 2.6 minutes, no fix needed.
- The saved script then ran twice with different names and **no AI**: both succeeded, 13–19 seconds each, returning the new employee id.
- The script’s own host block worked: pointed at another site, it failed immediately.
- OrangeHRM demo login is Admin / admin123, shown on its login page. Reliable success signal: the redirect to the employee’s page, not the toast.

Lessons for the build:

- **Model plan (decided):** build and test on the models the plan accepts now; switch to Sonnet for the final runs.
  - Accepted now (one-word prompt, each answered): `auto`, `composer-2.5`, `cursor-grok-4.6-high`, `grok-4.7-medium`. Only `auto` has been tried on a real browser task.
  - Sonnet (`claude-sonnet-5-thinking-high`) is refused: the plan’s usage limit is reached until 30 Oct. It needs a spend limit set in the Cursor account before the final runs.
  - The model name is one setting, so the switch is a one-line change. Leave time to rerun on Sonnet before the video; a different model may behave differently.
- The MCP server must be enabled once (`cursor-agent mcp enable playwright`) before a non-interactive run.
- The agent wrote its file to a mistyped path and still reported success. Use short workspace paths and check the file exists after every run.
- The Playwright MCP origin allowlist says of itself that it is not a security boundary. The invitation must be enforced by our runner, not by the MCP flag or by code the monster wrote.
- The saved script hardcoded the login. Logins need to come from the runtime.
- Cursor’s output reports tokens but no cost.
- Not yet tested: small reusable tools instead of one whole script; a second monster finding and reusing them.

---

## Honest limitations (to label)

- Tuned for the chosen sample sites; another site may not work.
- Emails are fixed-format, in a throwaway Gmail account.
- No sandbox: runs locally, domain limits enforced at the browser.
- The tank holds for the browser and for saved daily runs. While a monster is learning, it is a coding agent with command-line access on the laptop, which the tank does not contain.
- A change in meaning on a page (not just layout) can pass the automatic check.
- A run that fails halfway may leave earlier entries in place.
- Daily schedule shown at one-minute intervals.

---

## Dropped from the first brainstorm

Teacher / job-doer / forge as separate named layers; humans as a skill type; “zero tokens” as the headline pitch (kept as a property: daily runs have no model); `authority.json` hash ritual; creature names; the wheel, stones, blood, organs and habits metaphors; building our own mock legacy suite; LLM as judge.

---

## Stretch goal: pick up work from Slack and Linear

Only after the core product exists. Not part of the product overview spec.

**The idea:** the interview stops being the only way work arrives. The product also notices existing tasks in Slack and Linear and puts monsters or saved processes on them.

**How it fits what we already have**

- Slack and Linear are **connectors** in the invitation, like Gmail. Posting back needs write access, granted separately from reading.
- A message or ticket is an **item**, the same as an email.
- A doorman step decides what each new item is:
  - work a sealed process already covers → a normal model-free run;
  - work nothing covers → a proposed process, which still goes through invitation and seal;
  - noise or a duplicate → ignored.
- Matching an item to an existing process by a label or a named command needs no model. Only unfamiliar work costs tokens, once.
- “Needs a human” and the seal can be asked in the Slack thread where the work came from, and a reply there resumes the same piece of work.

**What the earlier project (Übermensch) taught, patterns only**

- **Opt-in by label.** Only tickets carrying a chosen label are picked up. Nothing is touched by surprise.
- **Slack without a public address** (a socket connection), and tickets fetched on a timer. No webhooks to set up on a hackathon night.
- **Every incoming thing lands in one inbox first,** with its outside identity stored as unique, so nothing is picked up twice.
- **Ignore your own messages everywhere,** or it answers itself in a loop.
- **Three outcomes for every incoming thing:** answer briefly, make it a task, or ignore it.
- **Say what you are doing where the work came from:** an acknowledgement in the thread, the ticket moved to in progress, a short summary when done.
- **A question to a human parks the task;** the reply in that thread resumes the same agent session, not a new one.
- **Cap the number of workers and the length of a session,** so cost cannot run away.
- **Do the last step yourself when the agent skips it.** There, the agent sometimes did not open its pull request, so the service did. Same lesson as our “the service verifies everything.”
- **A mode with no model at all** (scripted questions, rule-based sorting) kept the demo alive without a key.
- **The first dashboard was too crowded and had to be redone** as one calm column showing what is happening now. Build ours that way from the start.

---

## How to build it in parallel (learned from the same project)

That project was built in four hours by one person running several coding-agent sessions at once. What made it work:

- One short plan plus **one brief per workstream**.
- **Strict file ownership:** each session may edit only its own files.
- A small **shared contract** (database shape, configuration, function signatures) written first as stubs, which nobody changes without telling the others.
- Each session builds and tests against the stubs, with its neighbours mocked.
- **Sessions do not commit;** the human commits at checkpoints.
- Only one session installs packages.
- A fixed **integration slot**, then two rehearsals and a **backup video**.
- Named traps written down beforehand: answering itself, picking work up twice, runaway cost, secrets, live flakiness.

Our eight part specs map onto this directly: the first one (service and data model) is the shared contract, and the others can then be built side by side.

---

## Status

Planning only. No product code exists: the repo holds the empty scaffold (Next app, db package) and this plan. One throwaway browser test was run outside the repo (see “Proven so far”).

---

## Everything still missing

### Decided since the first list

Name (working), themed vocabulary, process 3 (offboarding), simple starting primitives are fine, Node service with something like Fastify, a failed daily run spawns a repair monster, the demo ends on a failure that triggers repair, the pitch angle (map vs working job).

### Decisions to make

1. **Record mode:** in or out, and whether the organizers accept a human-demonstrated tool.
2. **Storage:** Postgres for processes, runs and the shelf index, tool code in files. Proposed, not confirmed.
3. **Is the shelf committed to git?** It must start empty for the demo, but the created tools are evidence for the submission.
4. **Build model:** start on `auto`; compare Composer and Grok 4.7 on the real task once the starting kit exists.
5. **Example company name:** Bloodbuster, Kodark, Tombs R Us, Lichman Brothers, or another. To be decided later.
6. **Trigger for the demo failure:** changed email layout (proposed) or something else.

### Needs action from you

9. Set a spend limit in the Cursor account, or Sonnet stays blocked until 30 Oct.
10. Create a throwaway Gmail account and do the Google access setup (read-only).
11. Pick an existing Gmail MCP server.
12. Claim the Apify and ElevenLabs credits.
13. Apify through OpenRouter: tested and recorded under Models. Open only if we decide to build the orchestrator Actor.
14. Ask the organizers: do outside catalogues such as the Apify Store count as “existing tools”; is code written before the start allowed; is Friday a live demo or video only; the exact code-freeze time.
15. Tool versions and the repair record are now part of the design (see Repair); their exact shape belongs with the tool contract and data model below.

### Must be tested (assumed for now)

16. A monster produces **small reusable tools**, not one whole script. Assumed yes; the test produced one whole script.
17. A **second monster finds and reuses** tools from the first. Assumed yes; untested.
18. A **repair monster** fixes one broken tool from a failed run. Untested.
19. Composer and Grok on a real browser task. They have only answered a one-word prompt.
20. OrangeHRM: the leave form for process 2, and a leave type with a balance for the employee.
21. OrangeHRM: the end-of-employment form for process 3.
22. The ElevenLabs agent can call “spawn” as a tool, and can return each process in a structured form.
23. Each browser action returns ready-made Playwright code. Only the Cursor agent’s own word so far.
24. Several monsters running at the same time.
25. Tokens per monster run, for the cost estimate.

### Design not yet specified

26. **Tool contract:** what a tool receives and returns, and how it declares the sites it touches.
27. **Process format:** the chain of tools, how one step’s result feeds the next, and what the per-run input is.
28. **Brief:** exactly what the orchestrator hands a monster (description, sites, success criterion, schedule) and how the interview is turned into that.
29. **Repair brief:** what a repair monster is handed, and how “repaired” is told apart from “needs a human.”
30. **The automatic check:** how it is captured when the user confirms.
31. **Logins:** where they are held and how a tool receives them. A monster sees them while learning; the saved tools must not contain them.
32. **The invitation:** how the runner enforces it for every saved run, and how a refused attempt is shown.
33. **Reading Gmail on a daily run without a model:** through the MCP server called directly, or a tool the monster wrote.
34. **Daily input:** how new emails are picked up and how already-handled ones are skipped, so nobody is entered twice.
35. **Partial failure:** a run that stops halfway leaves earlier entries in place.
36. **Process 2 data:** what exactly goes into OrangeHRM for a leave request.
37. **Scheduler:** what triggers the daily run.
38. **Data model:** what is stored about processes, runs, tools and the invitation.
39. **UI:** screens for the interview, the shelf, processes, runs, the invitation and confirmation; how the theme file is adapted.
40. **Email format:** the fixed layout of the new-hire and leaver emails, and what sends them.

### Submission

41. Split the plan into implementation steps (next, by agreement).
42. Time budget against the hours actually left.
43. Evidence plan: repeated runs with the same outcome and no model, created vs reused tools, tokens per monster, one failure and its repair.
44. README table: real, simulated, missing. The starting kit listed openly; “tuned for these three processes, not hardcoded.”
45. Two-minute video script.

### Loose ends

46. Three test employees (“Ilona Test…”) remain on the shared OrangeHRM demo from the browser test.
47. Keys and tokens for the earlier project were pasted into chat sessions and sit in plain text in local history. Rotate any that are still live, and never paste one into this repo.
