"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { MonsterRun, ProcessDetail, Schedule } from "@repo/contract";
import {
  Chain,
  FamiliarPanel,
  foldSessions,
  ModelCalls,
  RunsList,
  RunSteps,
  relicHref,
  runHref,
} from "@/components/parts";
import { ProcessChips } from "@/components/status";
import {
  Button,
  Card,
  CommandButton,
  ConfirmDialog,
  Facts,
  Read,
  Rule,
  Sites,
  TextButton,
  Term,
  useCommand,
} from "@/components/ui";
import {
  clock,
  count,
  dateTime,
  duration,
  nextRun,
  plural,
  scheduleWords,
} from "@/lib/format";
import {
  useIsLive,
  useLab,
  useLabContext,
  useLabEvents,
  useNow,
} from "@/lib/lab/provider";

function ScheduleEditor({
  process,
  done,
}: {
  process: ProcessDetail;
  done: () => void;
}) {
  const { client } = useLabContext();
  const [kind, setKind] = useState<Schedule["kind"]>(process.schedule.kind);
  const [time, setTime] = useState(
    process.schedule.kind === "daily" ? process.schedule.time : "02:00",
  );
  const [minutes, setMinutes] = useState(
    process.schedule.kind === "every" ? String(process.schedule.minutes) : "1",
  );
  const save = useCommand(
    () =>
      client!.setSchedule(
        process.id,
        kind === "daily"
          ? { kind: "daily", time }
          : { kind: "every", minutes: Number(minutes) },
      ),
    done,
  );
  return (
    <form
      className="stack-sm"
      onSubmit={(e) => {
        e.preventDefault();
        void save.send();
      }}
    >
      <fieldset
        className="stack-sm"
        style={{ border: 0, padding: 0, margin: 0, gap: "0.4rem" }}
      >
        <legend className="field-label">When it runs</legend>
        <label className="check radio">
          <input
            type="radio"
            name="kind"
            checked={kind === "daily"}
            onChange={() => setKind("daily")}
          />
          Every day at
          <input
            className="input"
            style={{ width: "8rem" }}
            type="time"
            value={time}
            aria-label="Time of day"
            onChange={(e) => setTime(e.target.value)}
            onFocus={() => setKind("daily")}
          />
        </label>
        <label className="check radio">
          <input
            type="radio"
            name="kind"
            checked={kind === "every"}
            onChange={() => setKind("every")}
          />
          Every
          <input
            className="input"
            style={{ width: "6rem" }}
            type="number"
            min={1}
            max={1440}
            value={minutes}
            aria-label="Number of minutes"
            onChange={(e) => setMinutes(e.target.value)}
            onFocus={() => setKind("every")}
          />
          minutes
        </label>
      </fieldset>
      <div className="cmd">
        <Button type="submit" small disabled={save.pending}>
          {save.pending ? "Saving…" : "Save"}
        </Button>
        <TextButton onClick={done}>Leave it</TextButton>
        {save.fault ? (
          <span className="fault" role="alert">
            {save.fault}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function ScheduleLine({ process }: { process: ProcessDetail }) {
  const { client } = useLabContext();
  const now = useNow();
  const live = useIsLive();
  const [editing, setEditing] = useState(false);
  const [looking, setLooking] = useState(false);
  const [nothing, setNothing] = useState(false);
  useLabEvents((event) => {
    if (event.kind === "tick.finished" && event.processId === process.id) {
      setLooking(false);
      setNothing(event.newItems === 0);
    }
    if (event.kind === "run.started" && event.processId === process.id)
      setLooking(false);
  });
  const sealed = process.status === "sealed";
  const tick = process.lastTick;
  return (
    <section className="stack-sm" aria-label="Schedule">
      <h2>Schedule</h2>
      <div className="row" style={{ padding: 0 }}>
        <p className="figures">
          <strong>
            {process.status === "needs_human"
              ? "Paused"
              : scheduleWords(process.schedule)}
          </strong>
          {sealed ? <> · {nextRun(process.nextRunAt, now, !live)}</> : null}
          {process.status === "needs_human" ? (
            <span className="ash">
              {" "}
              · was: {scheduleWords(process.schedule)}
            </span>
          ) : null}
          <br />
          <span className="ash" role="status">
            {looking
              ? "Looking for new work…"
              : nothing
                ? "Nothing new."
                : tick
                  ? `Last look: ${clock(tick.at)} · ${tick.newItems === 0 ? "nothing new" : plural(tick.newItems, "item")}`
                  : "It has not looked for work yet."}
          </span>
        </p>
        <span className="inline">
          {editing ? null : (
            <TextButton onClick={() => setEditing(true)}>Change</TextButton>
          )}
          <CommandButton
            label="Run now"
            pendingLabel="Looking for new work…"
            disabled={!sealed || looking}
            title={
              process.status === "repairing"
                ? "Waits for the repair."
                : process.status === "needs_human"
                  ? "Paused. Resume first."
                  : undefined
            }
            run={async () => {
              setNothing(false);
              await client!.runNow(process.id);
              setLooking(true);
            }}
          />
        </span>
      </div>
      {editing ? (
        <ScheduleEditor process={process} done={() => setEditing(false)} />
      ) : null}
    </section>
  );
}

function SealPanel({
  process,
  onSealed,
}: {
  process: ProcessDetail;
  onSealed: () => void;
}) {
  const { client } = useLabContext();
  const run = process.runs.find((r) => r.id === process.verificationRunId);
  return (
    <Card className="gilded">
      <h2>It did the work once more, without the Familiar.</h2>
      <p>The lab ran the saved chain on a second example. No AI took part.</p>
      {run ? (
        <>
          <div className="stack-sm" style={{ gap: "0.3rem" }}>
            <p className="label">The example</p>
            <Facts
              rows={[
                { label: "Item", value: run.itemLabel },
                ...run.itemFields,
              ]}
              tight
            />
          </div>
          <div className="stack-sm" style={{ gap: "0.3rem" }}>
            <p className="label">
              What each <Term word="Relic" /> did
            </p>
            <RunSteps steps={run.steps} chain={process.chain} openLast />
          </div>
          <div className="proof">
            <span className="label">
              <Term word="Proof" /> · {process.check?.name}
            </span>
            <strong>{run.proofValue ?? "not present"}</strong>
          </div>
          <p className="figures" style={{ color: "var(--vellum)" }}>
            {run.status === "passed" ? "Passed" : "Did not pass"} ·{" "}
            {duration(run.durationMs)} · <ModelCalls n={run.modelCalls} />
          </p>
        </>
      ) : (
        <p>The verification run is not on record.</p>
      )}
      <CommandButton
        label="Seal"
        pendingLabel="Sealing…"
        run={() => client!.seal(process.id)}
        after={onSealed}
        note={`Sealing makes it live: ${scheduleWords(process.schedule).toLowerCase()}.`}
      />
    </Card>
  );
}

function HumanPanel({ process }: { process: ProcessDetail }) {
  const { client } = useLabContext();
  const resume = useCommand(() => client!.resume(process.id));
  const cause = process.cause;
  return (
    <div className="stack-sm">
      <div className="human" role="alert">
        <p className="label">Paused</p>
        <h2>Needs a human</h2>
        <p>{process.reason}</p>
        <div className="cmd">
          <Button
            variant="ink"
            onClick={() => void resume.send()}
            disabled={resume.pending}
          >
            {resume.pending ? "Resuming…" : "Resume"}
          </Button>
          {cause?.kind === "run" ? (
            <Link href={runHref(process.id, cause.runId)}>See the run</Link>
          ) : null}
          {cause?.kind === "refusal" ? (
            <Link href="/refused">See the refusal</Link>
          ) : null}
          {cause?.kind === "refusal" && cause.runId ? (
            <Link href={runHref(process.id, cause.runId)}>See the run</Link>
          ) : null}
          {resume.fault ? (
            <span className="fault" role="alert">
              {resume.fault}
            </span>
          ) : null}
        </div>
      </div>
      <p className="ash">
        The schedule is paused. Resume sets the stuck item aside: it is not
        tried again, and the schedule goes on with the next ones. Deal with that
        one by hand if it matters.
      </p>
    </div>
  );
}

function TeachingCost({
  process,
  sessions,
}: {
  process: ProcessDetail;
  sessions: MonsterRun[];
}) {
  const span = (s: MonsterRun) =>
    s.startedAt && s.endedAt
      ? duration(
          new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime(),
        )
      : "still going";
  const ordered = [...sessions].reverse();
  const calls = process.runs.reduce((sum, r) => sum + r.modelCalls, 0);
  const rows = ordered.map((s, i) => ({
    label:
      s.kind === "learn"
        ? ordered.filter((x) => x.kind === "learn").length > 1
          ? `Learning ${i + 1}`
          : "Learning"
        : "Repair",
    value: (
      <span className="figures">
        {count(s.tokens.total)} tokens · {span(s)}
        {s.kind === "repair" && s.repairId ? (
          <>
            {" · "}
            <RepairLink process={process} session={s} />
          </>
        ) : null}
      </span>
    ),
  }));
  rows.push({
    label: "Running",
    value: (
      <span className="figures">
        0 tokens · <ModelCalls n={calls} /> in{" "}
        {plural(process.runs.length, "run")}
      </span>
    ),
  });
  return (
    <section className="stack-sm">
      <h2>Teaching cost</h2>
      <Facts rows={rows} />
    </section>
  );
}

function RepairLink({
  process,
  session,
}: {
  process: ProcessDetail;
  session: MonsterRun;
}) {
  const run = process.runs.find((r) => r.id === session.failedRunId);
  const tool = run?.steps.find((s) => s.position === run.failedStep)?.tool;
  if (!tool) return <>repair record</>;
  return (
    <Link href={`${relicHref(tool)}#repair-${session.repairId}`}>
      Repair record
    </Link>
  );
}

function Body({
  process,
  sessions,
}: {
  process: ProcessDetail;
  sessions: MonsterRun[];
}) {
  const [stamped, setStamped] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const { client } = useLabContext();
  const status = process.status;
  const session = sessions.find((s) => s.id === process.currentMonsterRunId);
  const failedRun = session?.failedRunId
    ? process.runs.find((r) => r.id === session.failedRunId)
    : undefined;
  const hasHistory = process.chain.length > 0;
  const runs = (
    <RunsList
      runs={process.runs}
      firstAt={
        process.schedule.kind === "daily"
          ? process.schedule.time
          : "the next minute mark"
      }
    />
  );

  return (
    <>
      <div className="head">
        <p className="label">Process</p>
        <h1>{process.name}</h1>
        <ProcessChips
          status={status}
          repaired={process.repaired}
          latestRepair={process.latestRepair}
          stamp={stamped}
        />
        <Rule />
        <p>{process.description}</p>
        <Sites sites={process.sites.map((s) => s.site)} />
      </div>

      <div className="stack column">
        {status === "proposed" ? (
          <div className="stack-sm">
            <p>Heard in your interview. Not yet invited.</p>
            <div>
              <Button
                href={`/interviews/${encodeURIComponent(process.interviewId)}`}
              >
                Review and invite
              </Button>
            </div>
          </div>
        ) : null}

        {status === "queued" ||
        status === "learning" ||
        status === "failed_to_learn" ? (
          <FamiliarPanel
            process={process}
            session={session}
            waitsFor={process.waitsFor}
            compact
          />
        ) : null}
        {status === "queued" ? (
          <p>
            <Link href="/lab">Watch in the Forge</Link>
          </p>
        ) : null}

        {status === "awaiting_seal" ? (
          <SealPanel process={process} onSealed={() => setStamped(true)} />
        ) : null}

        {status === "needs_human" ? <HumanPanel process={process} /> : null}

        {status === "repairing" ? (
          <>
            <div
              className="bar"
              role="status"
              style={{ border: "1px solid var(--ember)" }}
            >
              <div className="wrap">
                A Relic broke. A Familiar is mending it. The schedule waits.
              </div>
            </div>
            <FamiliarPanel
              process={process}
              session={session}
              failedRun={failedRun}
              compact
            />
          </>
        ) : null}

        {status === "retired" ? (
          <p>
            Retired on {dateTime(process.retiredAt)}. Its{" "}
            <Term word="Relic">Relics</Term> stay in the{" "}
            <Term word="Library" />.
          </p>
        ) : null}

        {status === "sealed" ||
        status === "repairing" ||
        status === "needs_human" ? (
          <ScheduleLine process={process} />
        ) : null}

        {status === "sealed" ||
        status === "repairing" ||
        status === "needs_human" ||
        (status === "retired" && hasHistory) ? (
          <section className="stack-sm">
            <h2>Runs</h2>
            {runs}
          </section>
        ) : null}

        {hasHistory ? (
          <section className="stack-sm">
            <h2>The chain</h2>
            <Chain chain={process.chain} check={process.check} />
          </section>
        ) : null}

        {sessions.length ? (
          <TeachingCost process={process} sessions={sessions} />
        ) : null}

        {status !== "retired" ? (
          <div>
            <Button variant="ghost" onClick={() => setRetiring(true)}>
              Retire
            </Button>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={retiring}
        title={`Retire ${process.name}?`}
        confirmLabel="Retire"
        pendingLabel="Retiring…"
        run={() => client!.retire(process.id)}
        onClose={() => setRetiring(false)}
      >
        Its schedule stops and it leaves Tonight. Its Relics stay in the
        Library and its runs are kept. This cannot be undone.
      </ConfirmDialog>
    </>
  );
}

export function ProcessScreen() {
  const { id } = useParams<{ id: string }>();
  const process = useLab(`process:${id}`, (client) => client.getProcess(id));
  const sessions = useLab(
    `process:${id}:sessions`,
    (client) => client.listMonsterRuns({ processId: id }),
    {
      apply: foldSessions,
    },
  );
  return (
    <section className="band hazed">
      <div className="wrap">
        <Read read={process}>
          {(data) => <Body process={data} sessions={sessions.data ?? []} />}
        </Read>
      </div>
    </section>
  );
}
