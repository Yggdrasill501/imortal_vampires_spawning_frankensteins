"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ProcessDetail, Run } from "@repo/contract";
import {
  ModelCalls,
  processHref,
  relicHref,
  RunSteps,
  runHref,
} from "@/components/parts";
import { RunChip } from "@/components/status";
import { Facts, NotFound, Read, Rule, Tag, Term } from "@/components/ui";
import { dateTime, duration } from "@/lib/format";
import { useLab } from "@/lib/lab/provider";

const KIND: Record<Run["kind"], string> = {
  verification: "Verification",
  run_now: "Run now",
  after_repair: "After repair",
  scheduled: "Scheduled",
};

function RepairOutcome({ process, run }: { process: ProcessDetail; run: Run }) {
  const step = run.steps.find((s) => s.position === run.failedStep);
  const tool = useLab(`run:${run.id}:tool:${step?.tool}`, async (client) =>
    step ? client.getTool(step.tool) : null,
  );
  const repair = tool.data?.repairs.find((r) => r.id === run.repairId);
  const wroteBefore = run.steps.some(
    (s) => s.position < (run.failedStep ?? 0) && s.kind === "writes",
  );
  return (
    <div className="stack-sm">
      <h2>This failure woke a Familiar.</h2>
      {repair && step ? (
        repair.result === "verified" ? (
          <p>
            It mended <span className="mono">{repair.tool}</span>, v
            {repair.fromVersion} → v{repair.toVersion}.{" "}
            <Link href={`${relicHref(step.tool)}#repair-${repair.id}`}>
              Repair record
            </Link>
            {repair.retryRunId ? (
              <>
                {" · "}
                <Link href={runHref(process.id, repair.retryRunId)}>
                  The run after repair
                </Link>
              </>
            ) : null}
          </p>
        ) : (
          <p>
            Not fixed: {repair.reason}{" "}
            <Link href={`${relicHref(step.tool)}#repair-${repair.id}`}>
              Repair record
            </Link>
          </p>
        )
      ) : process.status === "repairing" ? (
        <p>
          It is mending the Relic now.{" "}
          <Link href={processHref(process.id)}>
            Watch it on the process page
          </Link>
        </p>
      ) : (
        <p className="ash">No repair record is on file for this run yet.</p>
      )}
      {wroteBefore ? (
        <p className="ash">
          Steps before this one already made their entries; they were left in
          place.
        </p>
      ) : null}
    </div>
  );
}

export function RunScreen() {
  const { id, runId } = useParams<{ id: string; runId: string }>();
  const process = useLab(`process:${id}`, (client) => client.getProcess(id));
  return (
    <section className="band hazed">
      <div className="wrap">
        <Read read={process}>
          {(data) => {
            const run = data.runs.find((r) => r.id === runId);
            if (!run) return <NotFound />;
            const done = run.status !== "running" && run.status !== "pending";
            return (
              <>
                <div className="head">
                  <p className="label">Run</p>
                  <h1>{run.itemLabel}</h1>
                  <span className="inline">
                    <RunChip status={run.status} />
                    <Tag>{KIND[run.kind]}</Tag>
                  </span>
                  <Rule />
                  <p className="figures">
                    Started {dateTime(run.startedAt)}
                    {done ? (
                      <>
                        {" · "}
                        {duration(run.durationMs)} ·{" "}
                        <ModelCalls n={run.modelCalls} />
                      </>
                    ) : (
                      " · still running"
                    )}
                  </p>
                  <p>
                    <Link href={processHref(data.id)}>Back to {data.name}</Link>
                  </p>
                </div>
                <div className="stack column">
                  <section className="stack-sm">
                    <h2>The item</h2>
                    <Facts rows={run.itemFields} tight />
                  </section>
                  <section className="stack-sm">
                    <h2>Step by step</h2>
                    <RunSteps steps={run.steps} />
                  </section>
                  <section className="proof">
                    <span className="label">
                      <Term word="Proof" /> · {data.check?.name}
                    </span>
                    {run.proofValue ? (
                      <strong>{run.proofValue}</strong>
                    ) : (
                      <p>{done ? "Proof: not present" : "Not yet."}</p>
                    )}
                  </section>
                  {run.status === "failed" ? (
                    <RepairOutcome process={data} run={run} />
                  ) : null}
                </div>
              </>
            );
          }}
        </Read>
      </div>
    </section>
  );
}
