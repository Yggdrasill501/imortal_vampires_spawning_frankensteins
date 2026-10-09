"use client";

import Link from "next/link";
import type { MonsterRun, ProcessSummary } from "@repo/contract";
import { ForgeScene } from "@/components/forge-scene";
import { FamiliarPanel, foldSessions } from "@/components/parts";
import { Button, Read, SectionHead, Term } from "@/components/ui";
import { count, lastNoon, plural } from "@/lib/format";
import { useLab, useNow } from "@/lib/lab/provider";
import { Kept } from "./tonight";

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

  const noon = lastNoon(now || 1);
  const teaching = (sessions.data ?? [])
    .filter((s) => s.startedAt && new Date(s.startedAt).getTime() >= noon)
    .reduce((sum, s) => sum + s.tokens.total, 0);
  const modelCalls = (runs.data ?? []).reduce(
    (sum, r) => sum + r.modelCalls,
    0,
  );
  const shelf = tools.data ?? [];
  const newTonight = shelf.filter(
    (tool) => new Date(tool.createdBy.at).getTime() >= noon,
  ).length;

  return (
    <section className="band forge">
      <ForgeScene />
      <div className="wrap">
        <SectionHead
          label="The forge"
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
          <p>
            The <Term word="Library" /> holds {plural(shelf.length, "Relic")}
            {newTonight ? `, ${count(newTonight)} made tonight` : ""}.{" "}
            <Link href="/reliquary">Open the Library</Link>
          </p>
        </SectionHead>

        <div className="lab">
          <div className="forging">
            <Read read={processes}>
              {(list) => {
                const panels = order(list, sessions.data ?? []);
                if (!panels.length) {
                  return (
                    <div className="stack-sm">
                      <h2>The forge is cold. No Familiar is at work.</h2>
                      <p className="ash">
                        Sealed work runs by itself and needs no Familiar.
                      </p>
                      <div className="actions">
                        <Button href="/interview">Begin an interview</Button>
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
        </div>

        <div className="kept">
          <Kept />
        </div>
      </div>
    </section>
  );
}
