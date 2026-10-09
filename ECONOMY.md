# The economy

What it costs to teach this system a task, what it costs to keep the task running, and what that is worth. Every number here is marked as **measured** (read from the lab's own records on the night), **stated** (said by the person in the interview) or **assumed** (ours, and yours to replace).

## The short version

- Teaching one task cost about **2 dollars** of tokens and **11 to 18 minutes**, once.
- Running it afterwards costs **0 tokens**: it is plain code, 25 to 45 seconds per item.
- A repair, when a site changes, cost about **1 dollar** and **three and a half minutes**.
- The one task we can put a figure on takes a person about **73 hours a year**.

The dollar figures rest on assumed prices, explained below. The minutes, the token counts and the zero are measured.

## What was measured

Sessions that ran through the lab service on 9 October, against a live HR system.

| Session | Time | Tokens in | Tokens out | Cached tokens re-read |
| --- | --- | --- | --- | --- |
| Learn "New hire" (6 tools written) | 11 min 22 s | 316,617 | 18,502 | 1,729,792 |
| Learn "Leave requests" (3 written, 2 reused) | 17 min 56 s | 220,273 | 28,444 | 3,356,992 |
| Repair one tool | 3 min 22 s | 221,091 | 2,660 | 559,616 |
| Learn "Leavers" | 20 min, then stopped | not reported | not reported | not reported |

Runs of the sealed processes:

| Run | Time | Model calls |
| --- | --- | --- |
| New hire, one email | 25 s and 43 s | 0 |
| Leave request, one email | 44 s | 0 |

The failed session matters for honesty: an agent that is stopped still spent tokens, and ours did not report how many. One in three learning sessions failed on the night.

## Turning tokens into money

We do not know what the tokens cost. The monsters ran through a Cursor plan with the model set to "auto", so neither the model nor the price per token is visible to us.

To get an order of magnitude we **assume** the list prices of a mid-range model: 3 dollars per million input tokens, 15 dollars per million output tokens, and 0.30 dollars per million cached tokens re-read. Replace them with your own.

| Session | Input | Output | Cached | Total |
| --- | --- | --- | --- | --- |
| Learn "New hire" | $0.95 | $0.28 | $0.52 | **$1.75** |
| Learn "Leave requests" | $0.66 | $0.43 | $1.01 | **$2.09** |
| Repair one tool | $0.66 | $0.04 | $0.17 | **$0.87** |

Most of the token count is cached context being re-read, which is cheap. If caching were not available, the same sessions would cost roughly 6 to 11 dollars each at these prices.

## What the task is worth

**Stated**, in the interview: adding a new hire to the HR system takes about five minutes per person, and there are three or four a night.

- 5 minutes × 3.5 people = 17.5 minutes a night.
- **Assumed** 250 working nights a year: about **73 hours a year** for this one task.
- **Assumed** 30 euros an hour, fully loaded: about **2,200 euros a year**.

Against that: about 2 dollars to teach it, and nothing in tokens to run it. Even if the hourly figure is wrong by half, or the task needs a repair every month, the ratio does not change much. This is one task for one person; the interview asks for up to three.

We did not ask how long the leave-request task takes, so there is no figure for it.

## Against the usual way

The usual way to get this is a consultancy or an internal project: people come in, interview the team, map the processes, redesign them, build the integration, and maintain it.

We have **no measured figure** for that, and we will not invent one. As an illustration only: **assume** 20 days of work at 1,000 euros a day. That is 20,000 euros and a couple of months before anything runs, and a change request each time a system changes.

The comparison is not like for like, and the difference cuts both ways:

- A consultancy **improves** the process. This system does not. It does the task the way the person described it, including the parts that should not exist.
- This system is **running the same night**. The description is a ten-minute conversation, and the integration is written by the agent.
- When a site changes, the consultancy sends an invoice. Here a repair monster rewrites one tool, for about a dollar, without being asked.

## Why the cost is paid only once

In most uses of AI agents the model is in the loop for every item: each new hire, each leave request, every night, costs tokens and can behave differently. Cost grows with the volume of work.

Here the model's output is not the work. It is **code that does the work**. Once the lab has checked that code and a person has sealed it, the model is no longer involved:

| | Model in the loop | This system |
| --- | --- | --- |
| Cost of the first item | tokens | tokens (about 2 dollars, once per task) |
| Cost of the thousandth item | the same tokens again | 0 tokens |
| Same behaviour every time | not guaranteed | yes, it is the same code |
| Cost when a site changes | none, or silent failure | one repair (about 1 dollar) |

The second process was also cheaper to describe than the first: it reused two tools the first agent had written. The more the Library holds, the less each new task has to write.

## How this becomes revenue

This is a direction, not a plan we have tested.

- **Charge for sealed processes that keep running**, per process per month, not for tokens. The customer's cost is flat while ours is close to zero after teaching.
- **The teaching cost is small enough to give away.** A first process learned for free is a cheap way to show the product on the customer's own systems.
- **The Library is the asset.** Tools written for one team's HR system are reused by the next team on the same system. A provider with many customers on Shopify or SAP would teach each system once.
- **Company-wide interviews.** The interview takes a few minutes per person. Interviewing a whole team finds the repeated work without anyone drawing a process map.

## What we did not count

- The machine it runs on, and the person's time for the interview and for reading each result before sealing it.
- Failed learning sessions. One of three failed on the night, and its tokens are unknown.
- How often real sites change. Our only repairs were of breaks we planted ourselves.
- Tasks that need judgment, or that touch systems without a browser interface. These are out of reach.
- The cost of a wrong action in a real system. The seal and the invitation limit it; they do not remove it.
- Our own engineering time.
