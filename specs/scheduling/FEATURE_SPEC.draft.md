# Scheduling Specification

> Purpose: When a sealed process runs. Part 6 of the product breakdown.

## Overview

A sealed process has a schedule. When it is due, the lab service creates a tick: the runner lists the incoming items and runs the chain for each new one. The user can also press Run now, which creates a tick immediately. This part supplies one thing to the lab service: the next run time for a schedule. It replaces the scheduling stand-in.

## Product Integration

- Ticks, their states and the dispatcher that claims them are in `specs/lab-service`.
- What a tick does is in `specs/shelf-and-runner`.
- The schedule control and countdown are in `specs/web-app`.

## Interaction Design

On the process page the user sees the schedule in words (“Every day at 08:00”, “Every 2 minutes”), the time of the next run, and a countdown when it is under an hour away. Changing it takes effect at once. Run now is always available on a sealed process.

## Schedules

| Kind            | Setting            | Meaning                                                    |
| --------------- | ------------------ | ---------------------------------------------------------- |
| Daily           | A time, `HH:MM`    | Once a day at that time, in the machine’s local time zone. |
| Every N minutes | N from 1 to 1440   | N minutes after the previous tick was created.             |

A new process takes the schedule the orchestrator proposed. With none, it is daily at 08:00.

## Rules

1. A schedule is active only while the process is sealed. It waits while the process is repairing or needs a human, and stops when it is retired.
2. The service checks every 30 seconds. A process is due when its next run time has passed and it has no tick queued or running.
3. One tick at a time per process. A process that is still working when its next time arrives is skipped until it finishes.
4. The next run time is computed when a process is sealed, when its schedule changes, when it returns to sealed after a repair or a resume, and each time a tick is created.
5. If the service was not running when a process was due, one tick is created on start. Missed ticks are never replayed one by one.
6. Run now creates a tick of its own kind and does not move the next scheduled time. While a tick is already queued or running, Run now does nothing and says so.
7. A tick that finds no new items is recorded as “nothing new.”

## User Flows

### Flow 1: A scheduled tick

**Steps**: The time passes. The service creates a queued tick and computes the next run time. The dispatcher claims the tick; the runner lists items; one run is created per new item.

**Result**: The tick is finished with the number of new items.

### Flow 2: Changing a schedule

**Steps**: The user picks a kind and a value. The service stores it and recomputes the next run time from now.

**Error Handling**: A time that is not a valid `HH:MM`, or minutes outside 1 to 1440, is refused with one sentence.

## Key Design Decisions

| Decision                                         | Rationale                                                                              |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Two schedule kinds only.                         | Daily is the real use. Every N minutes makes a daily job visible in a two-minute demo. |
| One catch-up tick after downtime.                | The items are still waiting; one tick collects all of them.                            |
| Run now does not move the schedule.              | Pressing a button should not silently change when the job runs tomorrow.               |
| Local time.                                      | One user on one machine.                                                               |

## Invariants

1. A process never has two ticks queued or running at once.
2. Only a sealed process is ever ticked.
3. A scheduled tick never calls an AI model.

## Authors

Filip Zitny, with Claude.
