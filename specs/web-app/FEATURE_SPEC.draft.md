# Web App Specification

> Purpose: The specification of the web app (`apps/web`): its look, its screens, what the user sees and does in every state, and what it asks of the lab service. It is part 7 of the product overview (`specs/product-overview/FEATURE_SPEC.draft.md`), which stays the source of truth for flows, terms, states and rules.

## Overview

The web app is the only thing the user touches. It shows what the lab service knows and sends the user's commands to it. It runs no agents and no Relics, holds no logins after they are submitted, and never reads the database or an outside site. The one exception is the voice interview, where the browser talks to ElevenLabs directly.

The app has two moods, and the design keeps them apart. While a Familiar learns or repairs, the screen is alive: actions stream in, the Reliquary fills and the token count climbs. Once a process is sealed, the screen is a quiet ledger: a schedule, a list of runs, and "0 model calls" on every row.

The look is the Castlevania vampire-castle theme of the design reference: near-black pages, blood red, bone-coloured type, and, on the landing page only, a painted blood-eclipse scene with a cliff-top castle. The job on screen stays an ordinary office job. The words around it are creepy; the facts are plain.

## Product Integration

- **The app talks only to the lab service.** Every read and every command goes to the endpoints in the overview's API Surface table. The browser calls the lab service directly, including the live event stream. The lab service's address is one configuration value.
- **The app has no database access.** The starter's database health route (`/api/health`) and the `@repo/db` dependency are removed from `apps/web`. The app shows the lab service's health instead: it reads `GET /health` and prints the answer in the footer of every screen. The starter page, its fonts and its light/dark colour variables are replaced by this spec.
- **Simulated mode.** The app reaches the lab service through one client interface with two implementations: the real one, and an in-browser simulation that plays the reference scenarios with no service running. Screens use only the interface. Whenever the simulation is active, every screen carries a small "Simulated data" marker, so it is never mistaken for the real thing.
- **Voice.** The Interview screen runs an ElevenLabs conversation in the browser, joined by a public agent id held in one configuration value. Nothing else in the app contacts an outside service.
- **One user, one machine, no sign-in.** There are no accounts, no roles and no permissions screens.
- **Language.** The app's own text is English. The interview is held, and its transcript shown, in the language the person speaks.
- **Screen size.** The app is designed for a laptop screen and stays usable down to a phone width as a single column.
- **Out of scope:** record mode, a reject action, pickup of work from Slack or Linear, any editing of a proposed process other than removing it, any view of Relic code.

## Interaction Design

### Design principles

1. **One calm column.** Every screen except the Lab is a single reading column that answers "what is happening now, and does it need me". There is no dashboard grid of widgets.
2. **Watching the Familiar work is the memorable screen.** The Lab is the only two-pane screen: the live action list on the left, the Reliquary filling on the right.
3. **Facts are never only decoration.** Anything a colour or an animation says is also said in words on the same screen. The castle and the bats say nothing: they are ambience.
4. **Red is the house colour, not an alarm.** Alarm has its own, single treatment (see Status marks).
5. **Themed word first, plain word beside it.** Nobody has to guess what a Relic is.

### Visual design system

The design reference is `index(1).html` (blood-eclipse variant). Only its look is used. The repository's root `index.html` is an older variant with different colours and a blackletter display font; it is not the reference.

**Dark theme only.** The page declares a dark colour scheme and has no light variant.

#### Colour tokens

| Token         | Value     | Role in the app                                                                                                                        |
| ------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `--night`     | `#080707` | Page background. Input background.                                                                                                     |
| `--crypt`     | `#0e0d0d` | Band and card background, bottom of the card gradient.                                                                                 |
| `--crypt-lit` | `#151313` | Top of the card gradient (the reference's literal value, now named).                                                                   |
| `--spill`     | `#7a030b` | Deep blood. Fill of the Refused slab and of nothing else.                                                                              |
| `--blood`     | `#b3121b` | Primary action fill, card border on hover, the Seal mark, diamond ornaments. Never used as text on a dark background (contrast 2.9:1). |
| `--ember`     | `#ff3d2e` | Accent text, focus ring, the live "working" mark, roman numerals, glow. The only red used for text.                                    |
| `--gilt`      | `#c9bfb2` | Labels, icons, quiet marks. A pale bone tone, not gold.                                                                                |
| `--gilt-dim`  | `#353131` | Hairlines, card borders, empty niches.                                                                                                 |
| `--vellum`    | `#f0e8e0` | Main text. Fill of the "Needs a human" chip.                                                                                           |
| `--ash`       | `#a29c98` | Secondary text, plain-word explanations, timestamps.                                                                                   |

Scene-only colours, used inside the castle canvas and nowhere else: ink `#070204` (silhouettes), rim `#8a1c22` (lit edges), window `#ff4a30`, gate `#ff5a3a`, sky from `#0a0103` through `#7a0a10` and `#e5321f`.

Translucent hairlines use vellum at 16–20% opacity. Section backgrounds may carry a faint red haze: a large radial gradient of blood at 7–26% opacity fading to transparent, as in the reference.

#### Type

| Role    | Token       | Family (fallbacks)                                                                           | Used for                                                                                                                                                                                     |
| ------- | ----------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display | `--display` | Cormorant Garamond (Palatino Linotype, Georgia, serif), weights 500, 600, 700 and italic 500 | Headings, big figures, process names, the Proof value, the wordmark (italic 600).                                                                                                            |
| Body    | `--body`    | Spectral (Iowan Old Style, Georgia, serif), 400, 600, italic 400                             | All running text, action list text, descriptions. Base size 1.0625rem, line height 1.65.                                                                                                     |
| Label   | `--label`   | Marcellus SC (Copperplate, Georgia, serif)                                                   | Small-caps labels, buttons, navigation, status chips, table headers. 0.74–0.84rem, letter-spacing 0.16–0.24em, uppercase.                                                                    |
| Machine | `--mono`    | The system monospace stack                                                                   | Only machine strings: Relic names, site host names, item identities, version numbers, file locations. Not in the reference; added because these strings must be read character by character. |

Scale: the home hero heading is `clamp(3rem, 7.4vw, 6rem)` at line height 0.95; page titles are `clamp(2.2rem, 4.6vw, 3.4rem)`; card and panel titles are 1.65rem. One word or phrase in a hero heading may be italic ember with a soft ember glow. Figures use lining, tabular numerals.

#### Spacing and shape

- Content width is at most 72rem with side padding `clamp(16px, 4vw, 40px)`. Single-column screens keep their text within 46rem.
- Sections are full-width bands with vertical padding `clamp(2.5rem, 5vw, 4rem)` (tighter than the reference's marketing bands). A band may start with a centred hairline that fades from transparent to blood and back.
- **Notched corners** are the shape of every card and panel: an octagonal clip with 14px corners (`--notch`), 8px on chips and small tiles (`--notch-sm`). A card is a `--gilt-dim` shape with an inset 1px smaller shape filled with the card gradient, which reads as a 1px border that follows the notches.
- Buttons have a 2px radius. Inputs have none. Nothing in the app is round except the eclipse and the Seal mark.
- Breakpoints follow the reference: 62rem (grids drop to two columns, navigation links collapse into a menu), 51rem (two-pane layouts stack), 34rem (everything is one column).

#### Ornament vocabulary

| Ornament       | Form                                                                                                            | Use                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Diamond        | A 7px square turned 45°, with a glow in its own colour                                                          | Status marks, list bullets, the rule, the corner of an ordered step.              |
| Rule           | A 9rem hairline with a blood diamond at its centre                                                              | Under every page title, between label, title and lead text.                       |
| Section head   | Label, then title, then rule, then one ash sentence                                                             | The opening of every screen and every major section.                              |
| Roman numerals | Display 500, ember, 2.8rem                                                                                      | The steps of a chain: I, II, III.                                                 |
| Ledger band    | A full-width `--crypt` band of four centred cells, big display figure above a small label, divided by hairlines | The four figures on Tonight.                                                      |
| Facts list     | Rows of a 7.5rem label column and a value column, divided by hairlines                                          | Every key-and-value block: a run step's result, a Relic's facts, a repair record. |
| Line icons     | 44-unit square, stroke 1.4, round joins, no fill, gilt                                                          | Action kinds in the action list, Relic tiles, empty states.                       |
| Blood spill    | Dark liquid running down inside a surface on hover or focus, drawn with the reference's gooey filter            | Blood buttons only.                                                               |
| Red haze       | Large, faint radial gradients of blood                                                                          | Section backgrounds.                                                              |

#### The castle

The castle is kept as it is in the reference. It is a procedural painting on a canvas, not an image and not an SVG: a seeded drawing routine paints the same picture every time. The app ports that routine unchanged in shape and proportion as one component, the Castle scene.

What the scene contains, back to front: a blood-red sky with streaked cloud banks; a black eclipse disc with a corona of filaments and a white-hot rim, upper right of the castle; two far ridges with haze between them; the cliff; the castle in ink silhouette with a thin rim of light on every right-hand edge; drifting fog at the castle's feet; a low foreground with two dead trees; bats crossing the eclipse; a vignette and film grain. The castle itself is a great keep with a hipped roof and two corner turrets, a chapel with one tall bell spire, a palace wing with dormers and chimneys, a crenellated curtain wall with a glowing gate, a round tower at each end, and a lower terrace wing with its own small tower.

The scene appears on exactly one screen: Tonight (`/`), the landing page, as the hero behind the navigation. No other screen has a castle header. Its composition is exactly the reference's: at laptop width the castle is centred at 68% of the width with the ground line at 80% of the height; below 820px it is centred at 48% with the ground line at 88%. The foreground trees are kept. The heading and buttons sit on the left over a left-to-right dark gradient (top-to-bottom on a narrow screen). The hero is at least 46rem high while no process exists and at least 34rem high afterwards.

The scene is drawn as in the reference and does not reflect state. Windows are lit in the reference's seeded pattern, the gate glows, and bats, fog, embers and the breathing glow behind the eclipse always run. The sky does not change with the time of day or with state: the eclipse is the look, and a dusk-to-dawn cycle would stand for nothing in the product. The scene is decoration: it is hidden from assistive technology and carries no information.

#### Bats

Bats are a light ambience of their own on three screens and nowhere else: Tonight (where they are part of the castle scene and cross the eclipse), the Lab and the Interview. On the Lab and the Interview a handful of small ink bats cross the top of the page behind the content, using the scene's bat shape. They take no pointer events, are hidden from assistive technology, pause while the tab is hidden, and are not drawn at all when "reduce motion" is set. They carry no information.

#### Motion

| Motion      | Where                              | Detail                                                                                                         |
| ----------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Scene       | Tonight's hero                     | Bats, fog drift, eclipse glow, embers, grain. Paused while the tab is hidden.                                  |
| Bats        | The Lab, the Interview             | A few bats cross the top of the page. Paused while the tab is hidden.                                          |
| Blood spill | Blood buttons                      | Liquid runs down in about a second on hover or focus and fades in 350ms on leave.                              |
| Pulse       | The working diamond                | Glow breathes on a 2-second cycle.                                                                             |
| Arrival     | A new action row, a new Relic tile | Fades and rises 6px in 250ms. A new Relic tile's border starts ember and settles to gilt-dim over 1.2 seconds. |
| Reuse       | A Relic tile being reused          | Its border flashes gilt for 1.2 seconds.                                                                       |
| Seal        | The Seal button, once              | The spill fills the button, then the Seal mark stamps into the page header in 600ms.                           |

With "reduce motion" set, the scene is a single still frame, the bat ambience is not drawn; spills, pulses, arrivals and the stamp are instant; smooth scrolling is off. Every state stays readable from its text.

#### Status marks

Each status is a chip: a mark, a label in the label face, and a plain-word tooltip. Status is never carried by colour alone: the mark's form and the label differ too.

| Status                       | Chip label                           | Mark                                               | Colour                                  | Plain words (tooltip)                                                         |
| ---------------------------- | ------------------------------------ | -------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------- |
| Process: proposed            | Heard                                | Hollow diamond                                     | Ash                                     | Proposed from your interview. Nothing has run.                                |
| Process: queued              | Waiting                              | Hollow diamond                                     | Gilt                                    | Invited. Waiting for a Familiar.                                              |
| Process: learning            | Familiar at work                     | Solid diamond, pulsing glow                        | Ember                                   | An agent is learning this process.                                            |
| Process: awaiting seal       | Awaiting your Seal                   | Solid diamond, steady                              | Gilt, with the page's blood Seal button | Verified by the lab. Waiting for you to confirm.                              |
| Process: failed to learn     | Failed to learn                      | Diamond with a stroke through it                   | Ember outline, no fill                  | The result did not pass verification.                                         |
| Process: sealed              | Sealed                               | Seal mark: a small blood disc with a notched edge  | Blood fill, vellum label                | Live. Runs on its schedule with no model.                                     |
| Process: sealed and repaired | Sealed, plus a second chip: Repaired | Seal mark; the Repaired chip shows a stitched line | Blood fill; Repaired is a gilt outline  | A Relic broke and was fixed without you. The chip links to the repair record. |
| Process: repairing           | Familiar repairing                   | Solid diamond, pulsing glow                        | Ember                                   | A Familiar is fixing a broken Relic. The schedule waits.                      |
| Process: needs a human       | Needs a human                        | Solid square (unturned)                            | Inverted: vellum fill, night text       | Paused. One sentence says why.                                                |
| Process: retired             | Retired                              | Hollow diamond                                     | Gilt-dim, ash label                     | Stopped by you. History is kept.                                              |
| Run: pending / running       | Running                              | Solid diamond, pulsing                             | Gilt                                    | A run is in progress.                                                         |
| Run: passed                  | Passed                               | Solid diamond                                      | Gilt                                    | The Proof was present.                                                        |
| Run: failed                  | Failed                               | Diamond with a stroke through it                   | Ember outline                           | A Relic failed at a step.                                                     |
| Run: refused                 | Refused                              | Barred circle                                      | Ember text on a `--spill` slab          | It tried to reach a site outside the Invitation.                              |

The inverted "Needs a human" chip is the only light-filled element in the app, so it is the first thing the eye finds. The `--spill` slab is used only for refusals.

#### Accessibility

- Text contrast against `--night`: vellum 16:1, gilt 10:1, ash 7:1, ember 5.7:1. Vellum on blood is 5.8:1. Blood is never text on dark.
- Keyboard focus is a 2px ember outline, offset 3px, on every interactive element. Inputs show an ember border on focus.
- Every action is reachable and operable by keyboard. Targets are at least 44px high.
- The live action list is announced politely as a log. Refusals and "Needs a human" are announced assertively.
- The castle canvas, the bats and all ornaments are hidden from assistive technology.
- Password fields are masked and never echoed back in any message.
- The transcript carries the language of the interview.

### Information architecture

| Route                          | Screen            | Purpose                                                                                                                            |
| ------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `/`                            | Tonight           | The landing page, and the only screen with the castle. What is happening now: what needs the user, who is working, what is sealed. |
| `/interview`                   | Interview         | The voice conversation.                                                                                                            |
| `/interviews/[id]`             | Review and invite | The proposed processes and the Invitation; "Invite and start".                                                                     |
| `/lab`                         | The Lab           | Familiars working live, next to the Reliquary.                                                                                     |
| `/processes/[id]`              | Process page      | One process in whatever state it is in. Holds the Seal panel, Run now, the schedule, the runs and Retire.                          |
| `/processes/[id]/runs/[runId]` | Run detail        | One run, step by step.                                                                                                             |
| `/reliquary`                   | Reliquary         | Every Relic.                                                                                                                       |
| `/reliquary/[name]`            | Relic detail      | Versions, recorded examples, repairs. A repair record is addressed as `/reliquary/[name]#repair-[id]`.                             |
| `/invitation`                  | Invitation        | What has been granted. Change a login, withdraw a site.                                                                            |
| `/refused`                     | Refused access    | Every attempt to reach something outside the Invitation.                                                                           |

Navigation is the top bar of every screen (on Tonight it lies over the castle; elsewhere over the plain night background with a hairline beneath): the wordmark on the left (links to Tonight), then Lab, Reliquary, Invitation, Refused, and a blood button "Begin an interview". The wordmark is the working name in the reference's style, italic display with ember underscores: `imortal_vampires_spawning_frankenstains`. The Refused link carries an ember count of refusals the user has not yet looked at; the count clears when `/refused` is opened. The Lab link carries a pulsing ember diamond while any Familiar is working.

There is no separate process list: Tonight is the list. A footer on every screen reads "Runs on this machine. One user. No sign-in.", shows the lab service's health in plain words ("The lab answers. Its database answers.", "The lab answers. Its database does not." or "The lab does not answer."), and holds the link "What the words mean", which opens the glossary (see Copy and tone).

### Screens

Every screen that reads from the lab service has the same three base states, described once here:

- **Loading:** the page frame and section heads render at once; lists show three hairline rows that breathe, with the ash line "Reading the ledger…". No spinners.
- **Read error:** the section shows "The lab did not answer." with the service's sentence beneath in ash and a ghost button "Ask again".
- **Not found:** "Nothing by that name lives here." with a link to Tonight.

Every command button shows its pending form (for example "Sealing…"), is disabled while pending so a command cannot be sent twice, and on failure shows the lab service's one-sentence reason in ember beside the button. If the service answers that the state has changed, the screen re-reads and shows "This changed while you were looking. The page is now up to date."

#### Tonight (`/`)

**First run (no process exists).** The castle hero at full height. Left, over the dark gradient: the label "Dusk · the Reliquary is empty"; the heading "Tell it your night's work. _It will keep it._"; the lead "Describe your daily work out loud. A Familiar learns each task once, and then the task runs every night with no AI in it."; the blood button "Begin the interview"; the ghost button "See the Reliquary"; and the line, with an ember diamond, "It only enters where it is invited."

Below the hero, the ledger band with four figures, all zero: "Relics in the Reliquary", "Processes sealed", "Runs passed", "Model calls in runs".

Below it, the Reliquary section: the section head "The Reliquary", then the Empty shelf: a row of six empty notched niches drawn in dashed `--gilt-dim`, and the lines "The Reliquary is empty. No Relic exists until a Familiar makes one." and, in ash, "No tools were written beforehand. Each agent builds the tools it needs."

**After that (any process exists).** The castle hero at its lower height, with the label "Tonight", the heading "The house works _while you sleep._", one plain sentence that counts what asks for the user, what is at work and what is sealed, the blood button "Begin an interview" and the ghost button "Watch the Lab". Then the ledger band with live figures, then one column of at most four groups. A group with nothing in it is not shown.

| Group        | Contains                                                                                                                | Each row shows                                                                                                                                | Row action                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Asks for you | Processes that need a human, await a Seal or failed to learn; interviews whose proposed processes have not been started | Name, chip, and one sentence: the reason, "Verified. Read the result and seal it.", or "3 processes heard at 21:04, not yet invited."         | Opens the Process page, or Review and invite |
| At work      | Processes queued, learning or repairing                                                                                 | Name, chip, the Familiar's latest action, tokens so far                                                                                       | Opens the Lab                                |
| Sealed       | Sealed processes                                                                                                        | Name, chips, schedule in words, last run ("Passed 02:14 · 14 s · 0 model calls"), next run ("next in 0:42" under an hour, otherwise the time) | Opens the Process page                       |
| Retired      | A closed disclosure "Retired (n)"                                                                                       | Name, when retired                                                                                                                            | Opens the Process page                       |

If a refusal exists that the user has not looked at, a Refused slab sits above the groups: "Refused at the threshold: evil.example. See what tried." linking to `/refused`.

When every group is empty but processes exist (all retired): "Nothing is kept tonight." and the button "Begin an interview".

#### Interview (`/interview`)

A few bats cross the top of the page. Section head: label "The interview", title "Tell it how your night goes.", ash line "Say what you do, step by step, in your own language. It will ask how long each task takes and how often."

The centre of the screen is the Eclipse button: a large black disc with the scene's white-hot rim and corona. Below it is the Transcript: turns in order, each with a label ("The house" or "You") and the text. Below the transcript is a text box, always present, labelled "Or write it here", which accepts typed and pasted text of any length.

| State              | What the user sees                                                                                                                                              | What the user can do                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Ready              | Eclipse button labelled "Begin". Ash line: "Your browser will ask for the microphone."                                                                          | Press Begin. Type or paste instead.                                 |
| Connecting         | The rim turns slowly. "Calling the house…"                                                                                                                      | Wait. Cancel.                                                       |
| In conversation    | The corona breathes with the voice that is speaking. The label under the disc reads "Listening" or "Speaking". Turns appear in the transcript as they are said. | Speak. Type a line. Press "End the interview" (blood).              |
| Microphone refused | "The microphone is closed to us. Write it instead." The text box takes focus.                                                                                   | Type or paste. End the interview.                                   |
| Voice lost         | A bar: "The voice is gone. Your words are kept. Go on in writing." The disc goes dark. Typed lines are added to the transcript as the user's turns.             | Type. Press "Call again" to reconnect the voice. End the interview. |
| Reading            | The transcript stays. Under it: "The transcript is being read. This takes a minute or two." with the rule's diamond pulsing. All controls are disabled.         | Wait.                                                               |
| Could not read     | "The lab could not read it. Nothing is lost." with the lab service's sentence beneath.                                                                          | Press "Read it again", which saves the same transcript again.       |

"End the interview" is disabled until the transcript holds at least one turn from the user. Typed lines go to the same ElevenLabs conversation while it is connected, so the agent can answer them; when it is not connected they are added straight to the transcript. The transcript is kept in the browser tab for as long as the screen is open and survives a reload.

Ending the interview saves the transcript. The lab service answers at once with the interview in the status "being read"; the screen shows the Reading state until an event says the interview has been read, and then the app moves to Review and invite for the new interview.

Opening `/interview?from=[id]` loads that interview's transcript into the screen so the conversation continues from it. Ending it saves the longer transcript as a new interview.

#### Review and invite (`/interviews/[id]`)

Section head: label "What it heard", title "Three tasks. Keep the ones you want." (the number is real), ash line "Nothing has touched any site yet."

1. **Transcript.** A closed disclosure "Read the transcript".
2. **Proposed processes.** One notched card each, in the order they were described. A card shows the name (display), the plain description, the sites it needs as host-name chips, "Proof" with the success criterion in the person's words ("How you know it worked"), and the schedule in words ("Every night at 02:00"). Each card has a ghost button "Strike it out", which turns into "Strike it out? · Yes · Keep it" in place; Yes removes the process and the card collapses.
3. **The Invitation.** The Invitation form (see Invitation), listing exactly the sites the remaining processes need. Removing a process removes the sites only it needed.
4. **The button.** "Invite and start" (blood), with the ash line "This is the moment it is let in. Only these sites, only with these logins."

The button is disabled, and its label says why, in this order of precedence:

| Condition                                           | Button label                           |
| --------------------------------------------------- | -------------------------------------- |
| A remaining process needs a site that is not ticked | "Missing: [site]. [Process] needs it." |
| A ticked site needs a login and has none            | "[Site] needs a login"                 |
| Otherwise                                           | "Invite and start"                     |

Pressing it stores the Invitation, starts the Familiars, and moves to the Lab. If the Invitation is stored but the start fails, the screen says "The Invitation is stored. The Familiars did not start." with the button "Start them".

| State                    | What the user sees                                                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Being read               | Opened before the reading has finished: the transcript disclosure and the line "The transcript is being read. This takes a minute or two." The screen fills in by itself when the proposals arrive.    |
| No process heard         | "It heard no process in that." and the blood button "Continue the interview", which opens `/interview?from=[id]`. No Invitation, no start button.                                                      |
| Every process struck out | "Nothing is left to start." and "Begin an interview".                                                                                                                                                  |
| Already started          | The cards are read-only, each with its current chip and a link to its Process page. The Invitation form and the start button are replaced by the line "Invited at 21:09." and a link to `/invitation`. |

#### The Lab (`/lab`)

A few bats cross the top of the page. Section head: label "The lab", title "Familiars at work", and a Tokens line in place of the ash sentence: "Tokens spent teaching tonight: 43,112 · Tokens spent running: 0". "Tonight" means since the most recent local noon, so one whole night is one period.

Two panes at laptop width, 7 to 5. Below 51rem they stack, Familiars first.

**Left pane: Familiars.** One Familiar panel per process that is queued, learning, repairing, awaiting seal or failed to learn, in the order the Familiars started; queued ones last.

| Panel state     | Contents                                                                                                                                                                                                                                            |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queued          | One line: name, "Waiting" chip, and "Waits its turn. [Other process] is using [site] first." or "Waits for a free Familiar."                                                                                                                        |
| Learning        | Header: process name; chip "Familiar at work"; kind "Learning"; elapsed time; tokens so far (total, with input, output and cached in the tooltip). Then "Relics in hand": one chip per Relic the Familiar has made or reused. Then the Action list. |
| Repairing       | As Learning, with kind "Repairing" and a first line: "Run failed at step II, [relic name]. Mending that Relic only." linking to the failed run.                                                                                                     |
| Verifying       | The Action list ends with a ruled-off block titled "The lab checks the work without the Familiar": one line per new Relic's install check and one line for the chain run on a second example, each ending Passed or Failed.                         |
| Awaiting seal   | The Action list closes to its last three rows. Chip "Awaiting your Seal". Blood button "Review and seal", which opens the Process page.                                                                                                             |
| Failed to learn | Chip "Failed to learn", the reason in one sentence, the button "Raise it again", and a link to the Process page.                                                                                                                                    |

The **Action list** is a fixed-height log (22rem) that keeps itself scrolled to the newest row unless the user has scrolled up, in which case a small "Newest ↓" control appears. Each row is: time (hh:mm:ss, ash), a line icon for the kind, and one sentence.

| Action kind            | Example sentence                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------- |
| Searched the Reliquary | Searched the Reliquary for "orangehrm login". Found 1.                                |
| Opened a page          | Opened opensource-demo.orangehrmlive.com/login.                                       |
| Clicked                | Clicked "Add Employee".                                                               |
| Typed                  | Typed the first name. (A password is shown as "Typed the password", never its value.) |
| Read                   | Read the employee id from the page.                                                   |
| Reused a Relic         | Reused `orangehrm_login`, made for Binding a fresh soul.                              |
| Created a Relic        | Made a new Relic: `orangehrm_create_employee`.                                        |
| Tested a Relic         | Tested `orangehrm_create_employee`. Passed.                                           |
| Saved the process      | Saved the chain: 4 Relics and a Proof.                                                |
| Refused                | Refused: evil.example is not in the Invitation. (Row is a `--spill` slab.)            |

**Created and reused Relics look different everywhere they appear together:**

|                            | Created by this Familiar                                            | Reused from the Reliquary                                                   |
| -------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Chip in "Relics in hand"   | Solid `--crypt-lit` fill, ember border, spark icon, the word "made" | No fill, gilt outline, chain-link icon, the words "reused · from [process]" |
| Count line under the chips | "3 made" in ember                                                   | "2 reused" in gilt                                                          |
| Tile in the Reliquary pane | Arrives with the ember-to-dim border and a "New tonight" tag        | Border flashes gilt; gains the line "Reused by [process]"                   |

**Right pane: the Reliquary.** Sticky beside the Familiars. A head "The Reliquary" with the count ("5 Relics"), then Relic tiles, newest first. A tile shows the name, the one-sentence description, site chips, and its tags. While the Reliquary is empty the pane shows the Empty shelf and "The Reliquary is empty."; the first Relic replaces the first niche, so the shelf visibly fills.

**Empty Lab (nobody queued or working, nothing awaiting).** Left pane: "The lab is still. No Familiar is at work." in display type, the ash line "Sealed work runs by itself and needs no Familiar.", the button "Begin an interview" and a link to Tonight. The right pane still shows the Reliquary.

#### Process page (`/processes/[id]`)

Header: label "Process", the name as title, the chip (and the Repaired chip where it applies), the rule, the plain description, and the site chips. The body depends on the state.

| State            | Body, top to bottom                                                                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proposed         | "Heard in your interview. Not yet invited." and the button "Review and invite".                                                                                                                                   |
| Queued, learning | A compact Familiar panel: the latest five actions, tokens so far, and the link "Watch in the Lab".                                                                                                                |
| Failed to learn  | The reason in one sentence. Blood button "Raise the Familiar again". Teaching cost. Retire.                                                                                                                       |
| Awaiting seal    | The Seal panel. Chain. Teaching cost. Retire.                                                                                                                                                                     |
| Sealed           | Schedule and Run now. Runs. Chain and Proof. Teaching cost. Retire.                                                                                                                                               |
| Repairing        | A bar: "A Relic broke. A Familiar is mending it. The schedule waits." Then the compact Familiar panel with live actions. Run now is disabled with the tooltip "Waits for the repair." Runs, Chain, Teaching cost. |
| Needs a human    | The Needs-a-human panel with the Resume button. Schedule shown as "Paused". Run now disabled. Runs, Chain, Teaching cost. Retire.                                                                                 |
| Retired          | "Retired on [date]. Its Relics stay in the Reliquary." Runs, Chain and Teaching cost, read-only. No commands.                                                                                                     |

**Seal panel.** Title "It did the work once more, without the Familiar." Ash line: "The lab ran the saved chain on a second example. No AI took part." Then:

- "The example": the item it ran on, as a facts list.
- "What each Relic did": the chain as roman-numbered steps, each with the Relic name, a "reused" or "made" tag, and its result as a facts list (closed by default, the last step open).
- "Proof": the Proof's name in a label and its value in large display type (for example "Employee id" and "0412").
- The line "Passed · 14 s · 0 model calls".
- The blood button "Seal", with the ash line "Sealing makes it live: every night at 02:00."

There is no reject. The only other way out is Retire, at the bottom of the page. After a successful Seal the Seal mark stamps into the header, the chip becomes "Sealed", and the body becomes the sealed body without a page change. The verification run is the first row in Runs, tagged "Verification".

**Schedule and Run now.** One line: the schedule in words ("Every night at 02:00" or "Every 1 minute"), the next run ("next in 0:42", counting down, when under an hour away; otherwise the time), and "Last look: 02:14 · nothing new" or "Last look: 02:14 · 2 items". A text button "Change" opens the Schedule editor in place: a choice between "Every day at" with a time field and "Every" with a number of minutes (1 to 1440), and "Save". To the right is the blood button "Run now". After Run now the line reads "Looking for new work…" until the tick ends, then either new rows arrive in Runs or the line reads "Nothing new." The schedule can be changed in every state except proposed and retired.

**Runs.** Newest first, twenty at a time with "Older runs". Each row: time; what it was for (the item's label, for example "Email: New hire, Ana Novak"); the chip; duration; "0 model calls"; the Proof value. A tag where it applies: "Verification", "Run now", "After repair". A failed row adds "Failed at step II, `relic_name`." and, when it woke a repair, the link "Repair record". A refused row is a `--spill` slab: "Refused: evil.example. `relic_name` tried to reach it." Each row opens Run detail. The model-call figure is the number the lab service reports for that run; a figure other than 0 is shown in ember. Empty: "No runs yet. The first comes at 02:00, or press Run now."

**Chain and Proof.** Title "The chain". Roman-numbered steps, each a Relic name linking to its Relic detail, its version, "reads" or "writes", and its one-sentence description. Under the last step: "Proof: [what must be present]."

**Teaching cost.** A facts list: "Learning" with its tokens and duration; one row per repair with its tokens and a link to the repair record; "Running" with "0 tokens · 0 model calls in [n] runs".

**Repaired chip.** Shown beside "Sealed" from the first verified repair onward. It links to the most recent repair record. Its tooltip: "Repaired [date]. `relic_name` v1 → v2."

**Needs-a-human panel.** An inverted panel (vellum fill, night text) at the top of the body: the title "Needs a human", the lab service's one sentence, a link to its cause, either "See the run" or "See the refusal", and the button "Resume" (pending form "Resuming…"). Beneath, in ash on the page: "The schedule is paused. Resume sets the stuck item aside: it is not tried again, and the schedule goes on with the next ones. Deal with that one by hand if it matters." Pressing Resume sends `POST /processes/:id/resume`; the chip returns to "Sealed" (with "Repaired" where it applied), the panel goes, and the schedule and "Run now" are live again without a page change. If the next item fails the same way, the ordinary failure or refusal path applies again.

**Retire.** A ghost button "Retire" at the foot of the page, in every state except proposed and retired. It opens a confirmation: title "Retire [name]?", text "Its schedule stops and it leaves Tonight. Its Relics stay in the Reliquary and its runs are kept. This cannot be undone.", buttons "Retire" (blood) and "Keep it". After retiring, the page shows the retired body.

#### Run detail (`/processes/[id]/runs/[runId]`)

Header: label "Run", title the item's label, the chip, and one line: started, duration, "0 model calls", and the tag (Verification, Run now, After repair, Scheduled). A link back to the process.

Body: "Step by step", the chain as roman-numbered steps. Each step shows the Relic name and version, Passed, Failed, Refused or "Not reached", and its result as a facts list. Then "Proof" with its value, or "Proof: not present".

| Run state | Extra content                                                                                                                                                                                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Running   | Finished steps appear as they complete; the current step's diamond pulses.                                                                                                                                                                                                                                                                |
| Passed    | Nothing more.                                                                                                                                                                                                                                                                                                                             |
| Failed    | The failing step is outlined in ember with the error text. Below: "This failure woke a Familiar." with the outcome: a link to the repair record and the "After repair" run, or the Needs-a-human sentence. Also "Steps before this one already made their entries; they were left in place." when a writing step came before the failure. |
| Refused   | The refused step is a `--spill` slab: the site, the Relic that tried, and "Nothing left this machine. No repair was started: a Familiar cannot repair its way to more access."                                                                                                                                                            |

#### Reliquary (`/reliquary`)

Section head: label "The Reliquary", title "Every Relic the Familiars have made", ash line "Small tools, one ability each, shared by every process. None was written by us."

A grid of notched Relic cards, three across at laptop width, in the order they were made (oldest first, so the order of the night reads left to right). A card shows a line icon, the name, the one-sentence description, site chips, "reads" or "writes", "Made by the Familiar of [process]", "Used by [n] processes" with their names in the tooltip, the current version, and a Repaired chip when any repair exists. The card's border turns blood on hover. A card opens Relic detail. There is no search and no filter.

Empty: the Empty shelf (two rows of niches), "The Reliquary is empty. No Relic exists until a Familiar makes one.", the ash line, and "Begin an interview".

#### Relic detail (`/reliquary/[name]`)

Header: label "Relic", the name as title, the description, then a facts list: Sites; Kind ("reads" or "writes"); Made by ("the Familiar of [process]", with date); Used by (process names, linked); Current version; Kept at (the code's location on disk, as text).

**Versions.** Newest first. Each version: its number, "current" where it is, when it became current, how it came to be ("made while learning [process]" or "made by a repair", linked), and "Recorded examples": a closed disclosure holding each example as input and result facts lists. Empty examples: "No examples yet. They are recorded when a process using this Relic is sealed." Older versions are marked "kept, not in use".

**Repairs.** Newest first; each is a repair record with the anchor `repair-[id]`. A record shows: "What failed" (the error, one or two sentences); "On which input" (the item's label, linking to the failed run); "What changed" (the Familiar's description of the change, as text); "Result" ("Verified. v2 is current." or "Not fixed: [reason]"); "Versions" (v1 → v2); "Cost" (tokens). A record opened by its anchor is scrolled to and outlined in gilt. Empty: "Never repaired."

#### Invitation (`/invitation`, and embedded in Review and invite)

The Invitation is one component, the Invitation form, used in two places. These are the only two places in the app that change the Invitation.

Standalone screen. Section head: label "The Invitation", title "It only enters where it is invited.", ash line "These are the only sites anything here can reach. Only you can change this, and only here."

One row per site:

| Part      | Content                                                                                                                                                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity  | Host name (machine face) and a plain kind: "website" or "mailbox, read only".                                                                                                                                                                  |
| Needed by | The processes that need it.                                                                                                                                                                                                                    |
| Invite    | A tick box. Embedded: ticked by default for every needed site. Standalone: every row is an invited site.                                                                                                                                       |
| Login     | Where a login is needed and none is held: fields "Name" and "Password" (masked). Where one is held: "Login held" and a text button "Change", which reveals empty fields. Where none is needed: "No login needed". A held login is never shown. |
| Granted   | Standalone only: when it was granted.                                                                                                                                                                                                          |
| Withdraw  | Standalone only: a ghost button "Withdraw". Disabled while any process that is not retired needs the site, with the line "Held by [processes]. Retire them first." Otherwise it confirms: "Withdraw [site]? Nothing will be able to reach it." |

A mailbox row carries the fixed line "It may read. It was never invited to send."

Standalone, the screen saves each change as it is made ("Save login", "Withdraw"). Embedded, nothing is saved until "Invite and start". New sites enter the Invitation only through Review and invite; the standalone screen cannot add a site.

Standalone empty state: "No one has been invited. Nothing here can reach any site." and the ash line "Sites are invited after an interview, before any Familiar starts."

Below the rows: "Turned away so far: [n]." linking to `/refused`.

#### Refused access (`/refused`)

Section head: label "Refused", title "Turned away at the threshold", ash line "Every attempt to reach a site that is not in the Invitation. Each was stopped before it left this machine."

A list of Refusal entries, newest first, each a `--spill` slab with ember text: the site in large machine type; "what tried": the Relic and version, and the process; "when": the stage ("When the Relic was being installed", "During a run", "While a Familiar explored") and the time; and a link to the run or to the process. Entries the user has not seen before carry an ember diamond; opening the screen marks all as seen.

Empty: "Nothing has been turned away." and, in ash, "No attempt has been made to reach a site outside the Invitation."

A refusal that arrives while the user is on any other screen shows the Refusal bar under the header until dismissed: "Refused: evil.example. `relic_name` tried to reach it. · See" linking to `/refused`.

### Live updates

The app keeps one connection to the lab service's live event stream for as long as any screen is open. It uses events in two ways:

1. **Appending.** A Familiar action is added to its Action list; a token update changes the token figures; a new or reused Relic updates the Reliquary pane and "Relics in hand".
2. **Re-reading.** Any event that says a process, run, Relic or refusal changed makes the app read that record again from the lab service. What a screen shows as status always comes from a read, never from an event alone.

When the connection drops:

| Moment                       | What the user sees                                                                                                                                                                                                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dropped                      | The Connection bar under the header: "The line to the lab has gone quiet. Trying again…" with the ash text "Live updates are paused. What you see may be out of date." Pulsing marks stop pulsing, countdowns freeze and show "?". Everything already on screen stays. |
| While retrying               | The app retries after 1, 2 and 5 seconds, then every 5 seconds, without limit. Commands stay enabled; one that cannot reach the service fails with "The lab did not answer."                                                                                           |
| Restored                     | The app re-reads everything on the current screen, reloads the stored actions of every visible Familiar so no row is missing, and the bar reads "The lab answers again." for three seconds.                                                                            |
| Never reachable (first load) | The frame renders, with "The lab does not answer." and "Start the lab service. This page wakes by itself." The app keeps retrying.                                                                                                                                     |

### Copy and tone

The work is ordinary; the voice is the house's. Rules:

- Headings, empty states and section leads speak in the house's voice: short, calm, slightly ominous. No jokes, no exclamation marks, no blood puns on buttons.
- Buttons, statuses and facts are plain. A button says what it does.
- The six themed names (Familiar, Relic, Reliquary, Invitation, Seal, Proof) are always capitalised. On first appearance on a screen each carries a dotted underline and a tooltip with its plain meaning. The glossary in the footer lists all six.
- Process names come from the interview and are shown as given. The plain description always sits directly under the name.
- Numbers are exact. Token counts are shown as tokens, never as money. Times are 24-hour local time; anything under an hour old is relative ("3 min ago"). Durations read "14 s" and "2 min 36 s".

Glossary:

| Themed     | Plain words                                               |
| ---------- | --------------------------------------------------------- |
| Familiar   | An AI agent that learns one process, or repairs one tool. |
| Relic      | A small tool the agent wrote. It does one thing.          |
| Reliquary  | The shared collection of all tools.                       |
| Invitation | The sites you allowed, and their logins.                  |
| Seal       | Your confirmation that a result is correct.               |
| Proof      | The value that must appear for a run to count as passed.  |

Key strings:

| Where                 | String                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primary buttons       | "Begin the interview" (hero) · "Begin an interview" (elsewhere) · "End the interview" · "Invite and start" · "Review and seal" · "Seal" · "Run now" · "Resume" · "Raise the Familiar again" · "Retire" |
| Secondary buttons     | "Strike it out" · "Keep it" · "Continue the interview" · "Call again" · "Read it again" · "Change" · "Save" · "Withdraw" · "Ask again" · "Watch in the Lab"                                            |
| Pending forms         | "Reading…" · "Inviting…" · "Sealing…" · "Looking for new work…" · "Resuming…" · "Raising…" · "Retiring…"                                                                                               |
| Model-free mark       | "0 model calls"                                                                                                                                                                                        |
| First-run label       | "Dusk · the Reliquary is empty"                                                                                                                                                                        |
| Empty Reliquary       | "The Reliquary is empty. No Relic exists until a Familiar makes one."                                                                                                                                  |
| Empty Lab             | "The lab is still. No Familiar is at work."                                                                                                                                                            |
| Empty runs            | "No runs yet."                                                                                                                                                                                         |
| Empty refusals        | "Nothing has been turned away."                                                                                                                                                                        |
| Empty Invitation      | "No one has been invited. Nothing here can reach any site."                                                                                                                                            |
| No process heard      | "It heard no process in that."                                                                                                                                                                         |
| The rule of the house | "It only enters where it is invited."                                                                                                                                                                  |
| Connection lost       | "The line to the lab has gone quiet. Trying again…"                                                                                                                                                    |

### Demo fit

The two-minute video has six beats. Each is carried by a screen that shows it without narration.

| Beat                                                                          | Screen                                                        | What is visible                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. The shelf is empty. The person talks; processes appear; Familiars spawn.   | Tonight (first run) → Interview → Review and invite → the Lab | The castle, the label "Dusk · the Reliquary is empty", four zeros and the empty niches. The Eclipse button and the transcript. Three process cards and the Invitation. After "Invite and start", Familiar panels appear and actions begin to stream.                                     |
| 2. A Familiar builds its Relics; the Reliquary fills; the user seals.         | The Lab → Process page                                        | Actions stream; "Made a new Relic" rows; tiles replace niches with "New tonight"; tokens climb. Then the Seal panel with the Proof value, and the Seal stamp.                                                                                                                            |
| 3. The same process again: no model, same outcome. The schedule ticks.        | Process page (sealed)                                         | "Run now" adds a row "Passed · 14 s · 0 model calls" with a Proof. "next in 0:42" counts down and a scheduled row arrives by itself. Teaching cost shows "Running: 0 tokens".                                                                                                            |
| 4. The second Familiar reuses Relics and builds only what is missing.         | The Lab                                                       | "Relics in hand" shows gilt "reused" chips beside ember "made" chips, the line "2 reused · 1 made", and old tiles flashing "Reused by". Fewer tokens than the first Familiar.                                                                                                            |
| 5. The "evil.example" email is refused.                                       | Process page → Refused access                                 | A `--spill` row "Refused: evil.example", the Refusal bar, the chip "Needs a human" with its sentence and the "Resume" button. `/refused` shows the entry under "Turned away at the threshold". Back on the Process page, "Resume" sets the email aside and the chip returns to "Sealed". |
| 6. A run fails on purpose; a repair Familiar fixes one Relic; the run passes. | Process page → Relic detail                                   | A "Failed at step I" row; the chip "Familiar repairing" with live actions on the same page; then "Sealed" plus "Repaired", and an "After repair" row that passed with 0 model calls. The Repaired chip opens the repair record: what failed, what changed, v1 → v2.                      |

## Terminology

The overview's terms apply unchanged. These are the web app's additions and its use of the overview's user-facing names.

| Term         | User-Facing         | DB/Code                       | Definition                                                                                                                                    |
| ------------ | ------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Tonight      | Tonight             | `tonight`                     | The home screen: the list of processes grouped by what they need.                                                                             |
| Lab          | The Lab             | `lab`                         | The screen where Familiars are watched at work.                                                                                               |
| Castle scene | —                   | `castle-scene`                | The painted hero of Tonight. It appears on no other screen.                                                                                   |
| Bats         | —                   | `bats`                        | The light ambience on the Lab and the Interview.                                                                                              |
| Action       | (a row in the list) | `action`                      | One thing a Familiar did, as one sentence with a kind and a time.                                                                             |
| Chain        | The chain           | `chain`                       | The ordered Relics of a process, as shown to the user.                                                                                        |
| Tick         | Last look           | `tick`                        | One time the runner looked for new work for a process.                                                                                        |
| Site         | Site                | `connector` / invitation site | Both websites and connectors are shown as sites, as the overview states. The kind is given in plain words: "website" or "mailbox, read only". |
| Item         | (its own label)     | `item`                        | Shown by a human-readable label, for example "Email: New hire, Ana Novak". The word "item" is not used in the interface.                      |
| Familiar     | Familiar            | `monster`, `monster_run`      | The interface never shows the words monster or monster run. One session is "Learning" or "Repairing".                                         |

## User Roles & Permissions

There is one user and no sign-in. The app offers a command only in the states where the overview allows it.

| Command                         | Offered when                                                   | Where                             |
| ------------------------------- | -------------------------------------------------------------- | --------------------------------- |
| Hold an interview               | Always                                                         | Navigation, Tonight, empty states |
| Remove a proposed process       | Process is proposed                                            | Review and invite                 |
| Grant the Invitation            | An interview has proposed processes not yet started            | Review and invite                 |
| Change a login, withdraw a site | Always; withdraw only when no unretired process needs the site | Invitation                        |
| Start a Familiar again          | Process failed to learn                                        | The Lab, Process page             |
| Seal                            | Process is awaiting seal                                       | Process page                      |
| Run now                         | Process is sealed (repaired or not)                            | Process page                      |
| Resume                          | Process needs a human                                          | Process page                      |
| Change a schedule               | Every state except proposed and retired                        | Process page                      |
| Retire                          | Every state except proposed and retired                        | Process page                      |

The app itself may never: call an AI model, run a Relic, reach a site other than the lab service and ElevenLabs, store a login after sending it, or change the Invitation from any screen but the two that hold the Invitation form.

## User Flows

### Flow 1: First run to Familiars at work

**Entry Point**: Tonight, first run.

**Preconditions**: The lab service is running. No process exists.

**Steps**:

1. The user sees the empty Reliquary and presses "Begin the interview".
2. On Interview the user presses Begin, allows the microphone and describes their work. Turns appear in the transcript.
3. The user presses "End the interview". The screen shows "The transcript is being read."
4. The app opens Review and invite with the proposed processes.
5. The user strikes out any process they do not want, ticks the sites, enters logins, and presses "Invite and start".
6. The app opens the Lab.

**Result**: Familiar panels show queued and working Familiars, and the first actions stream in.

**Error Handling**: Microphone refused or voice lost: the user continues in the text box. Reading fails: the transcript is kept and "Read it again" retries. No process heard: "Continue the interview". A missing site or login: the start button names it. The Invitation stored but the start failed: "Start them".

### Flow 2: Watch, then seal

**Entry Point**: The Lab.

**Preconditions**: At least one process is learning.

**Steps**:

1. The user watches actions arrive and Relics appear in the Reliquary.
2. The panel shows the lab's own verification lines, then "Awaiting your Seal".
3. The user presses "Review and seal" and reads the Seal panel on the Process page.
4. The user presses "Seal".

**Result**: The Seal mark stamps, the chip reads "Sealed", and the page shows the schedule, "Run now" and the verification run as the first row.

**Error Handling**: Verification failed: the panel reads "Failed to learn" with the reason and "Raise it again". Seal refused by the service: its sentence is shown beside the button and the page re-reads.

### Flow 3: Run now and the schedule

**Entry Point**: A sealed Process page.

**Preconditions**: The process is sealed.

**Steps**:

1. The user presses "Run now". The line reads "Looking for new work…".
2. New rows arrive in Runs, one per item, each ending "0 model calls".
3. The user presses "Change", picks "Every 1 minute" and saves. The countdown starts.
4. A scheduled row arrives by itself.

**Result**: The runs list shows repeated passes with the same kind of Proof and no model calls.

**Error Handling**: Nothing new: "Nothing new." A schedule the service rejects: its sentence beside "Save". A failed run: Flow 4. A refused run: Flow 5.

### Flow 4: A failure repairs itself

**Entry Point**: A run fails while the user is on the Process page (or anywhere).

**Preconditions**: The process is sealed. The failure is not a refusal.

**Steps**:

1. A "Failed at step …" row appears. The chip changes to "Familiar repairing" and a compact Familiar panel shows live actions.
2. The chip returns to "Sealed" with "Repaired" beside it. An "After repair" row passes.
3. The user presses the Repaired chip and reads the repair record on Relic detail.

**Result**: The user has seen, without doing anything, what broke, what changed and that the work continued.

**Error Handling**: Not fixed: the Needs-a-human panel shows the sentence and the "Resume" button, and the schedule shows "Paused".

### Flow 5: A refusal

**Entry Point**: Anything tries to reach a site outside the Invitation.

**Steps**:

1. The Refusal bar appears on whatever screen is open, and the Refused link's count rises.
2. On the Process page the run row is a `--spill` slab and the Needs-a-human panel names the cause.
3. The user opens `/refused` and reads the entry.
4. Back on the Process page the user presses "Resume".

**Result**: The user knows which site, what tried, and that nothing left the machine. The stuck item is set aside, the chip reads "Sealed" again and the schedule continues.

**Error Handling**: The service refuses the Resume: its sentence is shown beside the button and the page re-reads.

### Flow 6: Retire

**Entry Point**: The Process page.

**Steps**:

1. The user presses "Retire" and confirms.

**Result**: The page shows the retired body. The process leaves the open groups on Tonight and appears under "Retired". Its Relics remain in the Reliquary.

**Error Handling**: The service refuses: its sentence is shown in the confirmation.

### Flow 7: Change the Invitation later

**Entry Point**: `/invitation`.

**Steps**:

1. The user presses "Change" on a site, enters a new login, and presses "Save login"; or presses "Withdraw" on a site no unretired process needs, and confirms.

**Result**: The row reads "Login held", or is gone.

**Error Handling**: The service refuses: its sentence is shown on the row.

## Data Model

The app stores nothing of its own except two things in the browser: the interview transcript in progress, and the time of the newest refusal the user has seen. (In simulated mode the simulation also keeps its made-up records in the browser tab.) Everything else is a view of lab service records. These are the view models the screens need; they define what the app expects in the lab service's answers.

| View model       | Fields the app needs                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process summary  | id, name, description, status, repaired mark, interview id, sites, schedule, next run time, last run (status, time, duration, model calls), current Familiar session id and latest action, tokens so far.                                                                                                                                                                                 |
| Process detail   | Summary, plus: success criterion, chain steps (Relic name, version, reads or writes, made or reused by this process), Proof name, verification run id, reason (for failed to learn and needs a human) and its cause (run id or refusal id), latest repair (id, Relic name, old and new version, date), last tick (time, outcome), what it waits for when queued (process and site), runs. |
| Run              | id, process id, kind (verification, scheduled, run now, after repair), item label and identity, status, started, duration, model calls, Proof value, steps, failing step and error, refusals, repair id it led to, the item's fields (for the Seal panel's example).                                                                                                                      |
| Run step         | Position, Relic name and version, status, result as key-value pairs.                                                                                                                                                                                                                                                                                                                      |
| Familiar session | id, process id, kind (learn or repair), status, started, ended, model, tokens (input, output, cached, total), Relics made, Relics reused (with the process each was made for), reason on failure, actions, verification lines, the failed run id for a repair.                                                                                                                            |
| Action           | id, time, kind, sentence, Relic name where one is involved.                                                                                                                                                                                                                                                                                                                               |
| Relic            | Name, description, sites, reads or writes, made by (process, Familiar session, date), used by (processes), current version, versions, repairs, location of the code.                                                                                                                                                                                                                      |
| Relic version    | Number, current or not, became current, origin (learn or repair, linked), recorded examples (input and result pairs).                                                                                                                                                                                                                                                                     |
| Repair           | id, Relic name, old and new version, failed run id, the run that passed after it, what failed, item label, what changed, result, tokens, date.                                                                                                                                                                                                                                            |
| Invitation site  | Identity (host or connector name), plain kind, login needed, login held, granted time, processes that need it. Never a login.                                                                                                                                                                                                                                                             |
| Refusal          | id, site, what tried (Relic and version, process, run or Familiar session), stage, time.                                                                                                                                                                                                                                                                                                  |
| Interview        | id, status (being read, proposed, nothing found), the reason when it could not be read, transcript turns (speaker, text), language, start and end time, when its processes were invited, its processes.                                                                                                                                                                                   |
| Live event       | id, time, kind, and the ids of the interview, process, Familiar session, run, Relic or refusal it concerns, plus the Action or token figures where it carries them.                                                                                                                                                                                                                       |

Constraints the app relies on:

- A Relic name is unique and is the Relic's address in the app.
- A run's model-call count comes from the lab service. The app does not print a constant.
- A login travels one way: from an Invitation form field to the lab service. The app never receives one.

## State Diagram

The app has no states of its own beyond the overview's. This table maps each process state to what the app shows.

| Process state    | Tonight group                   | In the Lab          | Process page body         | Primary command              |
| ---------------- | ------------------------------- | ------------------- | ------------------------- | ---------------------------- |
| proposed         | Asks for you (as its interview) | —                   | Link to Review and invite | Invite and start (on Review) |
| queued           | At work                         | Queued panel        | Compact Familiar panel    | —                            |
| learning         | At work                         | Learning panel      | Compact Familiar panel    | —                            |
| awaiting seal    | Asks for you                    | Awaiting-seal panel | Seal panel                | Seal                         |
| failed to learn  | Asks for you                    | Failed panel        | Reason                    | Raise the Familiar again     |
| sealed           | Sealed                          | —                   | Schedule, Run now, Runs   | Run now                      |
| sealed, repaired | Sealed (with Repaired chip)     | —                   | As sealed                 | Run now                      |
| repairing        | At work                         | Repairing panel     | Repair bar and live panel | —                            |
| needs a human    | Asks for you                    | —                   | Needs-a-human panel       | Resume                       |
| retired          | Retired                         | —                   | Read-only                 | —                            |

Interview screen: `ready → connecting → in conversation → reading → (Review and invite)`, with `microphone refused` and `voice lost` leading back to `in conversation` by typing or "Call again", and `could not read` leading back to `reading`.

Connection: `live → dropped → live`, as described under Live updates.

## API Surface

The app uses only the endpoints in the overview's API Surface table.

| Screen            | Reads                                                                                                                                 | Commands                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every screen      | `GET /events` (one shared connection); `GET /health` for the footer; `GET /runs` and `GET /monster-runs` for the unseen-refusal count | —                                                                                                                                                                             |
| Tonight           | `GET /processes`, `GET /tools`, `GET /runs`                                                                                           | —                                                                                                                                                                             |
| Interview         | `GET /interviews/:id` (when continuing, and to read the result once the interview has been read)                                      | `POST /interviews`                                                                                                                                                            |
| Review and invite | `GET /interviews/:id`, `GET /invitation`                                                                                              | `DELETE /processes/:id`, `PUT /invitation`, `POST /interviews/:id/start`                                                                                                      |
| The Lab           | `GET /processes`, `GET /monster-runs`, `GET /tools`                                                                                   | `POST /processes/:id/learn`                                                                                                                                                   |
| Process page      | `GET /processes/:id`, `GET /monster-runs`                                                                                             | `POST /processes/:id/seal`, `POST /processes/:id/run`, `POST /processes/:id/resume`, `PUT /processes/:id/schedule`, `POST /processes/:id/learn`, `POST /processes/:id/retire` |
| Run detail        | `GET /processes/:id` (the run is one of its runs)                                                                                     | —                                                                                                                                                                             |
| Reliquary         | `GET /tools`                                                                                                                          | —                                                                                                                                                                             |
| Relic detail      | `GET /tools/:name`                                                                                                                    | —                                                                                                                                                                             |
| Invitation        | `GET /invitation`, `GET /processes`                                                                                                   | `PUT /invitation`                                                                                                                                                             |
| Refused access    | `GET /runs`, `GET /monster-runs` (refusals are gathered from both)                                                                    | —                                                                                                                                                                             |

### Required additions to the lab service API

**New endpoints: none.** Every screen is served by the overview's table, which includes `GET /health` and `POST /processes/:id/resume`. The exact shapes the app is built against are the types in the shared package `packages/contract` (`@repo/contract`).

**Required of the existing endpoints.** The overview leaves request and response shapes to the part specs. The web app needs the following from them; items marked † ask for data the overview's Data Model does not yet list.

1. The lab service accepts requests, including the event stream, from the web app's origin.
2. `GET /events` is a server-sent event stream. Each event carries an id, a time, a kind and the ids it concerns. Kinds: interview status changed; Familiar action; Familiar verification line; Familiar session status; token update; Relic created; Relic reused; Relic version made current; process status changed; run started; run finished; tick finished; refusal; repair recorded.
3. † A Familiar session (`GET /monster-runs`) carries its stored, ordered actions and verification lines, so the Action list survives a reload and a reconnect.
4. † A run carries its model-call count, its kind (verification, scheduled, run now, after repair), a human-readable item label, its Proof value, and the id of the repair it led to.
5. † A process (`GET /processes/:id`) carries its next run time, its last tick (time and outcome, including "nothing new"), the cause of "needs a human" (run id or refusal id), the latest repair id with the Relic name and versions, the verification run id, the current Familiar session id, and what it waits for while queued.
6. Each site of a proposed process says whether it is a website or a connector and whether it needs a login.
7. `GET /invitation` says, per site, whether a login is held. `PUT /invitation` takes the complete set of invited sites; a site sent without a login keeps the login already held.
8. A Relic (`GET /tools/:name`) carries whether it reads or writes, the process it was made for, the processes that use it, and for each chain step whether that process made or reused it.
9. Refusals are included in the runs and Familiar sessions they belong to, each with site, what tried, stage and time.
10. `POST /interviews` takes the transcript as ordered turns with speaker and text, plus the language, and answers at once with the interview in the status "being read". The proposals follow later: an "interview status changed" event tells the app to read the interview again. † If the reading fails, the interview carries one sentence saying why.
11. Every refused command answers with one sentence fit to show the user as it is.
12. `GET /health` says whether the service and its database are reachable, as two separate facts.
13. † A run carries the fields of its item as key-value pairs, and a repair carries the id of the run that passed after it.

## Component Inventory

| Component                           | Responsibility                                                                                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App frame                           | Navigation bar, the Connection bar, the Refusal bar, the page content, the footer with the health line and the glossary, and the "Simulated data" marker in simulated mode. |
| Castle scene                        | Paints the reference scene on a canvas as Tonight's hero, and nowhere else. Takes no state. Still frame under reduced motion; paused when hidden.                           |
| Bats                                | The bat ambience at the top of the Lab and the Interview. Not drawn under reduced motion; paused when hidden.                                                               |
| Lab client                          | The one interface to the lab service, with a real and a simulated implementation.                                                                                           |
| Health line                         | The lab service's health in plain words, in the footer.                                                                                                                     |
| Navigation                          | Wordmark, links, the Lab's working diamond, the Refused count, the interview button.                                                                                        |
| Live connection                     | Holds the one event stream, retries, and tells screens what to append and what to re-read. Exposes the connection state.                                                    |
| Connection bar                      | The dropped and restored messages.                                                                                                                                          |
| Refusal bar                         | The newest unseen refusal, dismissible.                                                                                                                                     |
| Section head                        | Label, title, rule, ash line.                                                                                                                                               |
| Rule, Diamond                       | The two ornaments.                                                                                                                                                          |
| Notched card                        | The card shape with its hairline border; hover turns the border blood.                                                                                                      |
| Button                              | Blood (with spill), ghost and text forms; pending and disabled states; inline failure sentence.                                                                             |
| Status chip                         | Mark, label and tooltip for every process and run status; the Repaired chip; the Seal mark.                                                                                 |
| Tag                                 | Small label for "New tonight", "reused", "made", "Verification", "Run now", "After repair", "reads", "writes".                                                              |
| Themed term                         | A themed name with dotted underline and plain-word tooltip.                                                                                                                 |
| Facts list                          | Label-and-value rows.                                                                                                                                                       |
| Ledger band                         | The four figures on Tonight.                                                                                                                                                |
| Site chip                           | A host name in the machine face.                                                                                                                                            |
| Empty shelf                         | The dashed niches, with a count of niches and how many are filled.                                                                                                          |
| Process row                         | One row in a Tonight group.                                                                                                                                                 |
| Eclipse button                      | The interview's start control and voice indicator.                                                                                                                          |
| Transcript                          | Turns with speaker labels; carries the interview's language.                                                                                                                |
| Text fallback box                   | Typed and pasted input for the interview.                                                                                                                                   |
| Proposed process card               | Name, description, sites, Proof, schedule, "Strike it out".                                                                                                                 |
| Invitation form                     | Site rows, tick boxes, login fields, "Login held", Withdraw; embedded and standalone modes.                                                                                 |
| Familiar panel                      | Full and compact forms, in every panel state; header, "Relics in hand", Action list, verification block.                                                                    |
| Action list                         | The self-scrolling log of Action rows.                                                                                                                                      |
| Action row                          | Time, kind icon, sentence; the refused variant.                                                                                                                             |
| Relic chip                          | The made and reused forms.                                                                                                                                                  |
| Relic tile                          | The compact Relic in the Lab's pane, with arrival and reuse motion.                                                                                                         |
| Relic card                          | The fuller Relic in the Reliquary grid.                                                                                                                                     |
| Tokens line                         | Teaching and running token figures.                                                                                                                                         |
| Seal panel                          | Example, steps, Proof, the Seal button and the stamp.                                                                                                                       |
| Chain                               | Roman-numbered steps with Relic links and the Proof line.                                                                                                                   |
| Schedule line and editor            | Schedule in words, countdown, last look, the two-choice editor.                                                                                                             |
| Runs list and Run row               | Rows with chip, duration, model-call figure, Proof, tags; failed and refused variants.                                                                                      |
| Run steps                           | The step-by-step body of Run detail.                                                                                                                                        |
| Needs-a-human panel                 | The inverted panel with sentence, cause link and the Resume button.                                                                                                         |
| Teaching cost                       | The facts list of tokens per Familiar session, and zero for running.                                                                                                        |
| Version list                        | A Relic's versions with recorded examples.                                                                                                                                  |
| Repair record                       | One repair, addressable by anchor.                                                                                                                                          |
| Refusal entry                       | One `--spill` slab on Refused access.                                                                                                                                       |
| Confirm dialog                      | Retire and Withdraw.                                                                                                                                                        |
| Loading rows, Read error, Not found | The three base states.                                                                                                                                                      |

## Key Design Decisions

| Decision                                                                                  | Rationale                                                                                                                                         |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tonight is one column grouped by "asks for you, at work, sealed".                         | An earlier dashboard was too crowded and had to be rebuilt as one calm column showing what is happening now. This one starts there.               |
| The Lab is the only two-pane screen.                                                      | Watching the agent work is the memorable screen, and the Reliquary filling next to it is the product's claim made visible.                        |
| The castle is kept as the reference paints it, on a canvas, on the landing page only.     | It is the look the user wants kept, and it belongs where the product introduces itself. On working screens it would push the work down the page.  |
| The castle does not reflect state.                                                        | It is drawn as in the reference. State is told in words, chips and the action list, where it can be read exactly.                                 |
| Bats on three screens only: Tonight, the Lab, the Interview.                              | They keep a little of the night on the two screens where the user waits and watches, and stay off the ledger screens, which should be still.      |
| "Needs a human" offers Resume, which sets the stuck item aside.                           | The item is what stopped the process. Retrying it would stop it again; the person deals with that one by hand and the rest of the work goes on.   |
| The app shows the lab service's health and has no database access of its own.             | The lab service owns the database. A second way to reach it from the app would be a second place for the truth to differ.                         |
| One client interface with a real and a simulated implementation.                          | Every screen and state can be seen and rehearsed before the lab service exists, and the simulation can never leak into a screen's code.           |
| The sky never changes.                                                                    | The blood eclipse is the look. A dusk-to-dawn cycle would decorate without meaning.                                                               |
| No new hues for status. Status is mark shape plus label, inside the red-and-bone palette. | A green "passed" would break the look. Shape and words also serve people who cannot tell the reds apart.                                          |
| "Needs a human" is the only inverted, light-filled element.                               | It is the one state that waits on the person, so it must be found first.                                                                          |
| Refusals have their own fill (`--spill`) used for nothing else.                           | Red is the house colour, so alarm needs a treatment red alone cannot give.                                                                        |
| Sealing happens on the Process page, not in the Lab.                                      | After the Seal the same page shows "Run now" and the runs, so the next demo beat needs no navigation.                                             |
| A repair is shown live on the Process page as well as in the Lab.                         | The repair starts by itself; the user should see it wherever they are looking at that process.                                                    |
| The repair record lives on Relic detail, reached by anchor.                               | A repair is a new version of a Relic. Showing it between v1 and v2 explains it without a separate screen.                                         |
| The Invitation form is one component in two places.                                       | It satisfies "only through the invitation screen" while keeping the grant on the review screen, where the overview puts it.                       |
| Sites enter the Invitation only through Review and invite.                                | Access is granted at one visible moment, for work the person has just read.                                                                       |
| A site in use cannot be withdrawn.                                                        | Withdrawing it would turn every dependent process into a refusal on its next run. Retiring first is one clear path.                               |
| Events tell the app what to re-read; status always comes from a read.                     | A missed or repeated event can never leave a wrong status on screen.                                                                              |
| "0 model calls" is a reported number, not a printed constant.                             | It is evidence. A constant would prove nothing.                                                                                                   |
| Tokens are shown as tokens.                                                               | The agent reports tokens and not cost. A price would be an estimate presented as a fact.                                                          |
| The app shows no Relic code.                                                              | The Reliquary endpoints return descriptions, versions, examples and repairs. The location on disk is shown for anyone who wants to read the file. |
| A fourth, monospace face for machine strings.                                             | Relic names, hosts and ids must be read exactly; the three reference faces are for prose and labels.                                              |
| The text box is always present on Interview.                                              | A bad connection must never stop an interview, and the fallback must not need finding.                                                            |
| English interface, interview in the person's language.                                    | The interview is where the person's own words matter. One interface language keeps the copy exact.                                                |
| The browser calls the lab service directly.                                               | The app shows state and sends commands; a relay inside the app would add a second place for state to go stale.                                    |
| Blood spill on blood buttons only.                                                        | In the reference it also runs on cards. In a working app with many cards on screen that would be noise.                                           |

## Invariants

1. The app sends requests only to the lab service and, for the voice interview, to ElevenLabs.
2. The app never calls an AI model, never runs a Relic and never opens an invited site.
3. The Invitation is changed only from the Invitation form, on Review and invite and on `/invitation`.
4. A login is never displayed, never kept in the browser after it is sent, and never appears in an Action row.
5. Every status on screen comes from a read of the lab service.
6. A command is offered only in the states where the overview allows it, and cannot be sent twice by pressing twice.
7. Every run row shows the model-call count the lab service reported.
8. A created Relic and a reused Relic never look the same where both appear.
9. An empty Reliquary is shown as empty niches, never as a missing section.
10. Status is never carried by colour alone.
11. Every themed name is explained in plain words on the screen where it appears.
12. Losing the live connection never clears what is on screen and is always stated.
13. The castle and the bats carry no information. The castle appears on Tonight only; bats appear on Tonight, the Lab and the Interview only.
14. The app has one theme: dark.
15. Simulated data is always marked as simulated.

## Authors

Filip Zitny, with Claude.
