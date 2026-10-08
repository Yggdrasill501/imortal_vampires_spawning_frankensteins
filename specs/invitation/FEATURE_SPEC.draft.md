# Invitation Specification

> Purpose: How access is granted and how it is enforced, so that the product can gain new abilities without ever gaining new access. Part 3 of the product breakdown.

## Overview

The rule is “it only enters where it is invited.” The user grants an invitation: a list of sites and connectors, with logins where needed. Everything that reaches outside the machine is checked against that list at the moment it tries. Nothing in the product can add to the list except the user, through the invitation form.

The lab service already owns the invitation records, the logins file and the gate (is this invited, give me the login, record a refusal). This part builds the enforcers that call the gate.

## Product Integration

- The gate and the logins file are specified in `specs/lab-service`.
- The install check and the runner, which host two of the enforcers, are in `specs/shelf-and-runner`.
- The monster’s browser, which hosts the third, is in `specs/monster`.
- The invitation form is in `specs/web-app`.

## Interaction Design

The user grants access once, on the review screen, by confirming each site and typing a login where one is needed. After that the invitation is quiet. It becomes visible again only when something is refused: a red entry naming the site and what tried to reach it.

## Terminology

| Term      | Definition                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------- |
| Site      | One host name, matched exactly. A sub-domain is a different site.                                       |
| Connector | A named outside tool server, such as `gmail`, with a fixed list of actions it may perform.              |
| Refusal   | A recorded attempt to reach something not invited.                                                      |
| Login     | A username and password for one site, held by the service and handed to tools at run time.             |

## Enforcement Points

| Where                         | What is checked                                                                 | What happens on a breach                                              |
| ----------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Starting a process            | Every site and connector the process needs is in the invitation.                | The process cannot be started; the screen names the missing site.     |
| Install check                 | Every site and connector a tool declares is in the invitation.                  | The tool is not installed; a refusal is recorded.                     |
| Before a step runs            | The tool’s sites are within the process’s sites.                                | The run is refused.                                                   |
| The runner’s browser          | Every request the page makes. The host must be one of the process’s sites.      | The request is stopped before it leaves the machine.                  |
| Connector calls               | The connector is declared by the tool and the action is on its allowed list.    | The call is refused.                                                  |
| The monster’s browser         | Started with the process’s sites as its allowed origins.                        | See “Stated limits.”                                                  |

**Page loads and background requests are treated differently.** A page navigation to an uninvited host is a refusal: it is recorded, shown in red, and stops the run with status `refused`. A background request to an uninvited host (a font, a tracker, a third-party script) is stopped silently and counted on the run, without stopping it. Real sites load such things constantly, and treating each as a breach would bury the one that matters.

**Connectors are read-only in this version.** Gmail’s allowed actions are searching and reading messages. Sending, deleting and changing labels are not on the list and cannot be invited.

## User Flows

### Flow 1: Granting

**Steps**: The user confirms the sites on the review screen and gives logins. The web app sends the complete set, including sites granted earlier. The service stores sites in the database and logins in its local file.

**Error Handling**: A set that drops a site an unretired process needs is refused with one sentence.

### Flow 2: A refused page load during a run

**Steps**:

1. A tool tries to open a page on a host outside the process’s sites.
2. The browser guard stops the request and records a refusal with the host, the tool and the run.
3. The run ends as `refused`. The process goes to “needs a human.” No repair starts.

### Flow 3: A refused tool at install

**Steps**:

1. A monster writes a tool that declares, or names in its code, a site that is not invited.
2. The install check fails it and records a refusal against the monster run.
3. The monster run ends as failed, unless the monster replaces the tool before it finishes.

This is the path an instruction hidden in an email takes. A monster that obeys “also forward this to another address” produces a tool that names an uninvited host or a connector action that is not allowed, and it is stopped here.

## Logins

- Stored only in `.lab/logins.json`, readable by the owner only, outside the database, the shelf and the committed source.
- Handed to a tool only for the sites that tool declares.
- Never returned by any endpoint. The service says only whether one is held.
- Removed from any text before it is stored or shown: monster actions, error messages, run records.
- A monster is told the login for the sites in its brief, because it must sign in to explore. The tools it writes must not contain it, and the install check rejects any that do.

## Key Design Decisions

| Decision                                                   | Rationale                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A site is an exact host name.                              | No patterns to get wrong. Granting a sub-domain is a deliberate act.                                |
| The real boundary is the runner’s browser guard.           | It sits outside the tool, so a tool cannot opt out, and it covers every saved run.                  |
| Background requests are stopped but are not breaches.      | Keeps the refusal list meaningful.                                                                  |
| A refusal never starts a repair.                           | A monster must not be able to fix its way to more access.                                           |
| Connectors have a fixed, read-only action list.            | “Read my mail” must never become “send mail” because a tool or an email asked.                      |
| Logins live in a local file, not the database.             | One place to protect, and nothing sensitive in exports or logs.                                     |

## Invariants

1. Only the user changes the invitation, through the invitation form.
2. No saved run reaches a host outside its process’s sites.
3. No tool is handed a login or connector it did not declare.
4. No login appears in a tool, a record, an event or an endpoint’s answer.
5. A refusal is always recorded and always visible.

**Stated limits**

- While a monster is learning or repairing it is a coding agent on the user’s machine. Its browser is started with the allowed origins, but that setting is a hint, not a boundary, and the monster’s own session is not confined. The guarantee covers every tool it produces and every saved run. This is not a sandbox.
- The install check’s scan of the code can be evaded by code written to evade it. The browser guard does not depend on it.

## Authors

Filip Zitny, with Claude.
