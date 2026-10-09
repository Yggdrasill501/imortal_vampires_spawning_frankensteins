"use client";

import type { Interview } from "@repo/contract";
import { ProcessChips } from "@/components/status";
import { Button, Card, Read, SectionHead, Tag } from "@/components/ui";
import { dateTime, duration, plural } from "@/lib/format";
import { useLab } from "@/lib/lab/provider";

/** What became of the interview, in a few words. */
function outcome(interview: Interview): string {
  if (interview.readError) return "Could not be read";
  if (interview.status === "being_read") return "Being read";
  if (interview.status === "nothing_found") return "Nothing found";
  return interview.invitedAt ? "Invited and started" : "Waiting for you";
}

/** The opening of what the person said, as a reminder of which night this was. */
function opening(interview: Interview): string {
  const said = interview.transcript
    .filter((turn) => turn.speaker === "user")
    .map((turn) => turn.text.trim())
    .join(" ");
  return said.length > 220 ? `${said.slice(0, 220).trimEnd()}…` : said;
}

export function Interviews() {
  const interviews = useLab(
    "interviews",
    (client) => client.listInterviews(),
    { refreshOn: (event) => event.kind === "interview.status" },
  );
  return (
    <section className="band hazed">
      <div className="wrap">
        <SectionHead label="The Interviews" title="Every night you told it">
          Each interview, what it heard in it, and what became of those tasks.
        </SectionHead>
        <Read read={interviews}>
          {(list) =>
            list.length === 0 ? (
              <div className="stack-sm">
                <p>Nothing has been said yet.</p>
                <div>
                  <Button href="/interview">Begin an interview</Button>
                </div>
              </div>
            ) : (
              <div className="stack column">
                {list.map((interview) => (
                  <Card
                    key={interview.id}
                    href={`/interviews/${encodeURIComponent(interview.id)}`}
                  >
                    <span className="inline">
                      <h3>{dateTime(interview.startedAt)}</h3>
                      <Tag>{outcome(interview)}</Tag>
                    </span>
                    <p>{opening(interview)}</p>
                    {interview.processes.length ? (
                      <ul className="stack-sm" style={{ gap: "0.4rem" }}>
                        {interview.processes.map((process) => (
                          <li key={process.id} className="inline">
                            <strong>{process.name}</strong>
                            <ProcessChips status={process.status} />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <span className="foot-line">
                      {plural(interview.processes.length, "task")} ·{" "}
                      {duration(
                        Date.parse(interview.endedAt) -
                          Date.parse(interview.startedAt),
                      )}{" "}
                      · {plural(interview.transcript.length, "turn")}
                    </span>
                  </Card>
                ))}
              </div>
            )
          }
        </Read>
      </div>
    </section>
  );
}
