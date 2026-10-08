"use client";

import Link from "next/link";
import { useState } from "react";
import type { MonsterRun, ProcessSummary } from "@repo/contract";
import { Bats } from "@/components/bats";
import { FamiliarPanel, foldSessions, RelicTile } from "@/components/parts";
import { Button, EmptyShelf, Read, SectionHead, Term } from "@/components/ui";
import { count, lastNoon, plural } from "@/lib/format";
import { useLab, useLabEvents, useNow } from "@/lib/lab/provider";

const SHOWN = [
  "learning",
  "repairing",
  "awaiting_seal",
  "failed_to_learn",
  "queued",
];

function order(
  processes: ProcessSummary[],
  sessions: MonsterRun[],
): ProcessSummary[] {
  const started = (p: ProcessSummary) =>
    sessions.find((s) => s.id === p.currentMonsterRunId)?.startedAt ?? "";
  return processes
    .filter((p) => SHOWN.includes(p.status))
    .sort((a, b) => {
      // Queued ones last; the rest in the order their Familiars started.
      const qa = a.status === "queued" ? 1 : 0;
      const qb = b.status === "queued" ? 1 : 0;
      return (
        qa - qb ||
        started(a).localeCompare(started(b)) ||
        a.position - b.position
      );
    });
}

export function Lab() {
  const now = useNow();
  const processes = useLab("lab:processes", (client) => client.listProcesses());
  const sessions = useLab(
    "lab:sessions",
    (client) => client.listMonsterRuns(),
    { apply: foldSessions },
  );
  const tools = useLab("lab:tools", (client) => client.listTools());
  const runs = useLab("lab:runs", (client) => client.listRuns(), {
    refreshOn: (e) => e.kind === "run.finished",
  });
  // Queued panels say what they wait for; that lives on the process detail.
  const waits = useLab(
    "lab:waits",
    async (client) => {
      const list = await client.listProcesses();
      const queued = list.filter((p) => p.status === "queued");
      const details = await Promise.all(
        queued.map((p) => client.getProcess(p.id)),
      );
      return Object.fromEntries(details.map((d) => [d.id, d.waitsFor]));
    },
    { refreshOn: (e) => e.kind === "process.status" },
  );

  const [reused, setReused] = useState<Record<string, number>>({});
  useLabEvents((event) => {
    if (event.kind === "tool.reused")
      setReused((held) => ({ ...held, [event.tool]: Date.now() }));
  });

  const noon = lastNoon(now || 1);
  const teaching = (sessions.data ?? [])
    .filter((s) => s.startedAt && new Date(s.startedAt).getTime() >= noon)
    .reduce((sum, s) => sum + s.tokens.total, 0);
  const modelCalls = (runs.data ?? []).reduce(
    (sum, r) => sum + r.modelCalls,
    0,
  );
  const shelf = [...(tools.data ?? [])].reverse();

  return (
    <section className="band hazed with-bats">
      <Bats />
      <div className="wrap">
        <SectionHead
          label="The lab"
          title={
            <>
              <Term word="Familiar">Familiars</Term> at work
            </>
          }
        >
          <p className="figures" aria-live="off">
            Tokens spent teaching tonight:{" "}
            <strong style={{ color: "var(--vellum)" }}>
              {count(teaching)}
            </strong>{" "}
            ·{" "}
            {modelCalls === 0 ? (
              <>
                Tokens spent running:{" "}
                <strong style={{ color: "var(--vellum)" }}>0</strong>
              </>
            ) : (
              <span className="ember">
                Model calls in runs: {count(modelCalls)}
              </span>
            )}
          </p>
        </SectionHead>

        <div className="lab">
          <div className="stack-sm" style={{ gap: "1.2rem" }}>
            <Read read={processes}>
              {(list) => {
                const panels = order(list, sessions.data ?? []);
                if (!panels.length) {
                  return (
                    <div className="stack-sm">
                      <h2>The lab is still. No Familiar is at work.</h2>
                      <p className="ash">
                        Sealed work runs by itself and needs no Familiar.
                      </p>
                      <div className="actions">
                        <Button href="/interview">Begin an interview</Button>
                        <Button href="/" variant="ghost">
                          Back to Tonight
                        </Button>
                      </div>
                    </div>
                  );
                }
                return panels.map((p) => {
                  const session = sessions.data?.find(
                    (s) => s.id === p.currentMonsterRunId,
                  );
                  const failedRun = session?.failedRunId
                    ? runs.data?.find((r) => r.id === session.failedRunId)
                    : undefined;
                  return (
                    <FamiliarPanel
                      key={p.id}
                      process={p}
                      session={session}
                      waitsFor={waits.data?.[p.id]}
                      failedRun={failedRun}
                    />
                  );
                });
              }}
            </Read>
          </div>

          <aside className="shelf-pane stack-sm" aria-label="The Reliquary">
            <div className="panel-head">
              <h2>
                The <Term word="Reliquary" />
              </h2>
              <span className="ash figures">
                {plural(shelf.length, "Relic")}
              </span>
            </div>
            <Read read={tools}>
              {() => (
                <>
                  {shelf.length === 0 ? <p>The Reliquary is empty.</p> : null}
                  <div className="tiles">
                    {shelf.map((tool) => {
                      const made = new Date(tool.createdBy.at).getTime();
                      return (
                        <RelicTile
                          key={tool.name}
                          tool={tool}
                          isNew={made >= noon}
                          arrived={now > 0 && now - made < 2500}
                          flash={
                            now > 0 && now - (reused[tool.name] ?? 0) < 1500
                          }
                        />
                      );
                    })}
                  </div>
                  {shelf.length < 6 ? (
                    <EmptyShelf niches={6 - shelf.length} />
                  ) : null}
                  <p>
                    <Link href="/reliquary">Open the Reliquary</Link>
                  </p>
                </>
              )}
            </Read>
          </aside>
        </div>
      </div>
    </section>
  );
}
