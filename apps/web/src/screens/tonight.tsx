"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { ProcessSummary } from "@repo/contract";
import { CastleScene } from "@/components/castle-scene";
import { readRefusals } from "@/components/frame";
import { lastRunWords, processHref } from "@/components/parts";
import { ProcessChips } from "@/components/status";
import {
  Button,
  Diamond,
  EmptyShelf,
  Read,
  SectionHead,
  Term,
} from "@/components/ui";
import {
  clock,
  count,
  dateTime,
  nextRun,
  numberWord,
  plural,
  scheduleWords,
  when,
} from "@/lib/format";
import {
  useIsLive,
  useLab,
  useNow,
  useRefusalsSeenAt,
} from "@/lib/lab/provider";

const ASKS = ["needs_human", "awaiting_seal", "failed_to_learn"];
const WORKS = ["queued", "learning", "repairing"];

function askLine(p: ProcessSummary): string {
  if (p.status === "awaiting_seal")
    return "Verified. Read the result and seal it.";
  return p.reason ?? "It waits for you.";
}

function Group({
  title,
  plain,
  children,
}: {
  title: string;
  plain: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="group-title">
        <h2>{title}</h2>
        <span className="ash">{plain}</span>
      </div>
      <ul className="rows">{children}</ul>
    </section>
  );
}

function ProcessRow({
  p,
  href,
  line,
}: {
  p: ProcessSummary;
  href: string;
  line: React.ReactNode;
}) {
  return (
    <li>
      <Link href={href} className="row">
        <span className="row-name">{p.name}</span>
        <ProcessChips status={p.status} repaired={p.repaired} />
        <span className="row-line figures">{line}</span>
      </Link>
    </li>
  );
}

export function Tonight() {
  const now = useNow();
  const live = useIsLive();
  const processes = useLab("tonight:processes", (client) =>
    client.listProcesses(),
  );
  const tools = useLab("tonight:tools", (client) => client.listTools());
  const runs = useLab("tonight:runs", (client) => client.listRuns());
  const refusals = useLab("tonight:refusals", readRefusals, {
    refreshOn: (e) => e.kind === "refusal",
  });
  const [seenAt] = useRefusalsSeenAt();

  // Only here does the navigation lie over the castle. An effect, so it lifts when this screen is put away.
  useEffect(() => {
    document.body.classList.add("on-tonight");
    return () => document.body.classList.remove("on-tonight");
  }, []);

  const all = processes.data ?? [];
  const firstRun = processes.data !== undefined && all.length === 0;
  const asks = all.filter((p) => ASKS.includes(p.status));
  const works = all.filter((p) => WORKS.includes(p.status));
  const sealed = all.filter((p) => p.status === "sealed");
  const retired = all.filter((p) => p.status === "retired");
  const heard = new Map<string, ProcessSummary[]>();
  for (const p of all.filter((x) => x.status === "proposed")) {
    heard.set(p.interviewId, [...(heard.get(p.interviewId) ?? []), p]);
  }
  const asking = asks.length + heard.size;
  const unseen = (refusals.data ?? []).find(
    (r) => new Date(r.at).getTime() > seenAt,
  );

  const figures = [
    { label: "Relics in the Reliquary", value: tools.data?.length },
    {
      label: "Processes sealed",
      value: processes.data
        ? all.filter((p) => p.sealedAt && p.status !== "retired").length
        : undefined,
    },
    {
      label: "Runs passed",
      value: runs.data?.filter((r) => r.status === "passed").length,
    },
    {
      label: "Model calls in runs",
      value: runs.data?.reduce((sum, r) => sum + r.modelCalls, 0),
    },
  ];

  return (
    <>
      <div
        className={`hero ${firstRun || processes.data === undefined ? "" : "low"}`}
      >
        <CastleScene />
        <div className="wrap" style={{ flex: 1, display: "flex" }}>
          {firstRun || processes.data === undefined ? (
            <div className="pitch">
              <p className="label">Dusk · the Reliquary is empty</p>
              <h1>
                Tell it your night&rsquo;s work. <em>It will keep it.</em>
              </h1>
              <p className="lede">
                Describe your daily work out loud. A <Term word="Familiar" />{" "}
                learns each task once, and then the task runs every night with
                no AI in it.
              </p>
              <div className="actions">
                <Button href="/interview">Begin the interview</Button>
                <Button href="/reliquary" variant="ghost">
                  See the Reliquary
                </Button>
              </div>
              <p className="hours">
                <Diamond className="ember" />
                It only enters where it is invited.
              </p>
            </div>
          ) : (
            <div className="pitch">
              <p className="label">Tonight</p>
              <h1>
                The house works <em>while you sleep.</em>
              </h1>
              <p className="lede">
                {asking
                  ? `${numberWord(asking)} ${asking === 1 ? "thing asks" : "things ask"} for you. `
                  : "Nothing asks for you. "}
                {works.length
                  ? `${numberWord(works.length)} at work. `
                  : "No Familiar is at work. "}
                {sealed.length
                  ? `${numberWord(sealed.length)} sealed.`
                  : "Nothing is sealed yet."}
              </p>
              <div className="actions">
                <Button href="/interview">Begin an interview</Button>
                <Button href="/lab" variant="ghost">
                  Watch the Lab
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="ledger">
        <div className="wrap">
          <dl>
            {figures.map((figure) => (
              <div key={figure.label}>
                <dt>{figure.label}</dt>
                <dd>
                  {figure.value === undefined ? "–" : count(figure.value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <section className="band hazed">
        <div className="wrap">
          <Read read={processes}>
            {() =>
              firstRun ? (
                <>
                  <SectionHead
                    level={2}
                    label="What it has made"
                    title={
                      <>
                        The <Term word="Reliquary" />
                      </>
                    }
                  />
                  <div className="stack-sm">
                    <EmptyShelf
                      niches={6}
                      filled={Math.min(6, tools.data?.length ?? 0)}
                    />
                    <p>
                      {tools.data?.length
                        ? `The Reliquary holds ${plural(tools.data.length, "Relic")}.`
                        : "The Reliquary is empty. No Relic exists until a Familiar makes one."}
                    </p>
                    <p className="ash">
                      No tools were written beforehand. Each agent builds the
                      tools it needs.
                    </p>
                  </div>
                </>
              ) : (
                <div className="stack column">
                  {unseen ? (
                    <Link href="/refused" className="slab" role="alert">
                      Refused at the threshold:{" "}
                      <span className="mono">{unseen.site}</span>. See what
                      tried.
                    </Link>
                  ) : null}

                  {asking ? (
                    <Group title="Asks for you" plain="These wait on you.">
                      {asks.map((p) => (
                        <ProcessRow
                          key={p.id}
                          p={p}
                          href={processHref(p.id)}
                          line={askLine(p)}
                        />
                      ))}
                      {[...heard.entries()].map(([interviewId, list]) => (
                        <li key={interviewId}>
                          <Link
                            href={`/interviews/${encodeURIComponent(interviewId)}`}
                            className="row"
                          >
                            <span className="row-name">
                              {list.map((p) => p.name).join(" · ")}
                            </span>
                            <ProcessChips status="proposed" />
                            <span className="row-line">
                              {plural(list.length, "process", "processes")}{" "}
                              heard at {clock(list[0].createdAt)}, not yet
                              invited.
                            </span>
                          </Link>
                        </li>
                      ))}
                    </Group>
                  ) : null}

                  {works.length ? (
                    <Group title="At work" plain="A Familiar has these.">
                      {works.map((p) => (
                        <ProcessRow
                          key={p.id}
                          p={p}
                          href="/lab"
                          line={
                            <>
                              {p.latestAction?.text ??
                                (p.status === "queued"
                                  ? "Waits its turn."
                                  : "Starting.")}{" "}
                              · {count(p.tokens.total)} tokens so far
                            </>
                          }
                        />
                      ))}
                    </Group>
                  ) : null}

                  {sealed.length ? (
                    <Group
                      title="Sealed"
                      plain="These run by themselves, with no model."
                    >
                      {sealed.map((p) => (
                        <ProcessRow
                          key={p.id}
                          p={p}
                          href={processHref(p.id)}
                          line={
                            <>
                              {scheduleWords(p.schedule)} ·{" "}
                              {lastRunWords(p.lastRun)} ·{" "}
                              {nextRun(p.nextRunAt, now, !live)}
                            </>
                          }
                        />
                      ))}
                    </Group>
                  ) : null}

                  {!asking && !works.length && !sealed.length ? (
                    <div className="stack-sm">
                      <h2>Nothing is kept tonight.</h2>
                      <div>
                        <Button href="/interview">Begin an interview</Button>
                      </div>
                    </div>
                  ) : null}

                  {retired.length ? (
                    <details>
                      <summary
                        className="btn-text"
                        style={{ display: "inline-flex", alignItems: "center" }}
                      >
                        Retired ({retired.length})
                      </summary>
                      <ul className="rows" style={{ marginTop: "0.6rem" }}>
                        {retired.map((p) => (
                          <ProcessRow
                            key={p.id}
                            p={p}
                            href={processHref(p.id)}
                            line={`Retired ${now ? when(p.retiredAt, now) : dateTime(p.retiredAt)}`}
                          />
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              )
            }
          </Read>
        </div>
      </section>
    </>
  );
}
