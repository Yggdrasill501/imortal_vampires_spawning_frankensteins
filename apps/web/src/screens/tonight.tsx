"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { ProcessSummary } from "@repo/contract";
import { CastleScene } from "@/components/castle-scene";
import { readRefusals } from "@/components/frame";
import { lastRunWords, processHref } from "@/components/parts";
import { ProcessChips } from "@/components/status";
import { Button, Diamond, Read } from "@/components/ui";
import {
  clock,
  count,
  dateTime,
  nextRun,
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

// Awaiting a Seal and failed to learn are shown as panels in the Forge.
const ASKS = ["needs_human"];

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

const PATH = [
  {
    numeral: "I",
    name: "The Interview",
    plain: "Say your daily work out loud. It listens and writes it down.",
  },
  {
    numeral: "II",
    name: "The Forge",
    plain: "One agent per task learns it in a browser and writes the tools.",
  },
  {
    numeral: "III",
    name: "The Library",
    plain: "The tools are kept. The task then runs each night with no AI.",
  },
];

/** The landing: the castle, what this is, and one way in. No side navigation here. */
export function Landing() {
  // Only here is the navigation put away. An effect, so it returns when this screen is left.
  useEffect(() => {
    document.body.classList.add("on-tonight");
    return () => document.body.classList.remove("on-tonight");
  }, []);

  return (
    <>
      <div className="hero landing">
        <CastleScene />
        <div className="wrap" style={{ flex: 1, display: "flex" }}>
          <div className="pitch">
            <p className="label">imortal vampires spawning frankenstains</p>
            <h1>
              Tell it your night&rsquo;s work. <em>It will keep it.</em>
            </h1>
            <p className="lede">
              Describe your daily work out loud. An agent learns each task once,
              and then the task runs every night with no AI in it.
            </p>
            <ol className="path">
              {PATH.map((step) => (
                <li key={step.numeral}>
                  <span className="numeral">{step.numeral}</span>
                  <span>
                    <strong>{step.name}</strong>
                    <span className="ash">{step.plain}</span>
                  </span>
                </li>
              ))}
            </ol>
            <div className="actions">
              <Button href="/interview">
                Enter the domain of the immortals
              </Button>
            </div>
            <p className="hours">
              <Diamond className="ember" />
              It only enters where it is invited.
            </p>
          </div>
        </div>
      </div>
      <Economy />
    </>
  );
}

/**
 * What it costs. The consultancy column is our estimate; the other two are
 * measured, and the live line under them is read from the lab.
 */
function Economy() {
  const sessions = useLab("landing:sessions", (client) =>
    client.listMonsterRuns(),
  );
  const runs = useLab("landing:runs", (client) => client.listRuns());
  const taught = sessions.data?.reduce((sum, s) => sum + s.tokens.total, 0);
  const passed = runs.data?.filter((r) => r.status === "passed").length;
  const calls = runs.data?.reduce((sum, r) => sum + r.modelCalls, 0);

  return (
    <section className="band economy">
      <div className="wrap">
        <p className="label">The economy</p>
        <h2>
          You pay to teach it once. <em className="glow">Then it is free.</em>
        </h2>
        <div className="costs">
          <div className="cost">
            <p className="label">A consultancy</p>
            <p className="cost-figure">Months</p>
            <ul>
              <li>Comes in, interviews the team, maps every process.</li>
              <li>Redesigns the work to make it more efficient.</li>
              <li>A project with a budget, and a new one for each change.</li>
            </ul>
            <p className="ash cost-note">Our estimate, not a measurement.</p>
          </div>
          <div className="cost lit">
            <p className="label">Teaching it, once</p>
            <p className="cost-figure">6 to 18 minutes</p>
            <ul>
              <li>One spoken interview, then one agent per task.</li>
              <li>
                1.6 to 4.1 million tokens per task, most of it cached context.
              </li>
              <li>It does not redesign your work. It does it, as you do.</li>
            </ul>
            <p className="ash cost-note">
              Measured on two tasks in a live HR system.
            </p>
          </div>
          <div className="cost lit">
            <p className="label">Every night after</p>
            <p className="cost-figure">0 tokens</p>
            <ul>
              <li>The learned task is plain code. No AI model runs it.</li>
              <li>
                A site changes and a tool breaks: one repair, about 2 minutes.
              </li>
              <li>After the repair it costs nothing again.</li>
            </ul>
            <p className="ash cost-note">
              Measured: about 400,000 tokens for one repair.
            </p>
          </div>
        </div>
        <p className="figures cost-live" aria-live="off">
          On this machine so far:{" "}
          <strong>{taught === undefined ? "–" : count(taught)}</strong> tokens
          spent teaching ·{" "}
          <strong>{passed === undefined ? "–" : count(passed)}</strong> runs
          passed · <strong>{calls === undefined ? "–" : count(calls)}</strong>{" "}
          model calls in those runs
        </p>
      </div>
    </section>
  );
}

/** Every process that is not being forged right now: what waits on you, what is sealed, what is retired. */
export function Kept() {
  const now = useNow();
  const live = useIsLive();
  const processes = useLab("tonight:processes", (client) =>
    client.listProcesses(),
  );
  const refusals = useLab("tonight:refusals", readRefusals, {
    refreshOn: (e) => e.kind === "refusal",
  });
  const [seenAt] = useRefusalsSeenAt();

  const all = processes.data ?? [];
  const asks = all.filter((p) => ASKS.includes(p.status));
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

  return (
    <Read read={processes}>
      {() => (
        <div className="stack">
          {unseen ? (
            <Link href="/refused" className="slab" role="alert">
              Refused at the threshold:{" "}
              <span className="mono">{unseen.site}</span>. See what tried.
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
                      {plural(list.length, "process", "processes")} heard at{" "}
                      {clock(list[0].createdAt)}, not yet invited.
                    </span>
                  </Link>
                </li>
              ))}
            </Group>
          ) : null}

          {sealed.length ? (
            <Group
              title="Sealed scripts"
              plain="These run by themselves, with no model."
            >
              {sealed.map((p) => (
                <ProcessRow
                  key={p.id}
                  p={p}
                  href={processHref(p.id)}
                  line={
                    <>
                      {scheduleWords(p.schedule)} · {lastRunWords(p.lastRun)} ·{" "}
                      {nextRun(p.nextRunAt, now, !live)}
                    </>
                  }
                />
              ))}
            </Group>
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
      )}
    </Read>
  );
}
