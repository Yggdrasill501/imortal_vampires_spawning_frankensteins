"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  Action,
  ChainStep,
  Check,
  LabEvent,
  MonsterRun,
  ProcessSummary,
  Run,
  RunStep,
  ToolSummary,
  WaitsFor,
} from "@repo/contract";
import {
  clock,
  clockSeconds,
  count,
  duration,
  roman,
  tokenTooltip,
  when,
} from "@/lib/format";
import { useLabContext, useNow } from "@/lib/lab/provider";
import { ProcessChips, RunChip, StepChip } from "./status";
import {
  Button,
  CommandButton,
  Disclosure,
  Facts,
  Icon,
  Sites,
  Tag,
  Term,
  type IconName,
} from "./ui";

export const relicHref = (name: string) =>
  `/reliquary/${encodeURIComponent(name)}`;
export const processHref = (id: string) =>
  `/processes/${encodeURIComponent(id)}`;
export const runHref = (processId: string, runId: string) =>
  `${processHref(processId)}/runs/${encodeURIComponent(runId)}`;

/** Folds live Familiar events into the sessions already held, so the action list grows without a read. */
export function foldSessions(
  sessions: MonsterRun[],
  event: LabEvent,
): MonsterRun[] | null {
  if (
    event.kind !== "monster.action" &&
    event.kind !== "monster.tokens" &&
    event.kind !== "monster.verification"
  ) {
    return null;
  }
  const index = sessions.findIndex((s) => s.id === event.monsterRunId);
  if (index < 0) return null;
  const session = sessions[index];
  let next: MonsterRun;
  if (event.kind === "monster.action") {
    if (session.actions.some((a) => a.id === event.action.id)) return sessions;
    next = { ...session, actions: [...session.actions, event.action] };
  } else if (event.kind === "monster.tokens") {
    next = { ...session, tokens: event.tokens };
  } else {
    const lines = session.verification.filter((l) => l.id !== event.line.id);
    next = { ...session, verification: [...lines, event.line] };
  }
  const copy = [...sessions];
  copy[index] = next;
  return copy;
}

// ───────────── Action list ─────────────

function ActionRow({ action, fresh }: { action: Action; fresh: boolean }) {
  const tone =
    action.kind === "refused"
      ? "refused"
      : action.kind === "create_tool"
        ? "made"
        : "";
  return (
    <div className={`log-row ${tone} ${fresh ? "fresh" : ""}`}>
      <time dateTime={action.at}>{clockSeconds(action.at)}</time>
      <Icon name={action.kind as IconName} small />
      <span>{action.text}</span>
    </div>
  );
}

/** The self-scrolling log. It stays at the newest row unless the user has scrolled up. */
export function ActionList({
  actions,
  short,
  children,
}: {
  actions: Action[];
  short?: boolean;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const [away, setAway] = useState(false);
  const now = useNow();
  const length = actions.length;

  useEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [length, children]);

  return (
    <div className="log-wrap">
      <div
        ref={ref}
        className={`log ${short ? "short" : ""}`}
        role="log"
        aria-live="polite"
        aria-label="What the Familiar did"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          pinned.current = atEnd;
          setAway(!atEnd);
        }}
      >
        {actions.length === 0 ? (
          <p className="ash" style={{ padding: "0.6rem 0.9rem" }}>
            Nothing yet. The first action comes in a moment.
          </p>
        ) : null}
        {actions.map((action) => (
          <ActionRow
            key={action.id}
            action={action}
            fresh={now > 0 && now - new Date(action.at).getTime() < 1500}
          />
        ))}
        {children}
      </div>
      {away ? (
        <button
          type="button"
          className="log-newest"
          onClick={() => {
            const el = ref.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
        >
          Newest ↓
        </button>
      ) : null}
    </div>
  );
}

// ───────────── Relics: chip, tile ─────────────

export function RelicsInHand({ session }: { session: MonsterRun }) {
  const made = session.toolsCreated;
  const reused = session.toolsReused;
  if (!made.length && !reused.length) {
    return <p className="ash">No Relic in hand yet.</p>;
  }
  return (
    <div className="stack-sm" style={{ gap: "0.5rem" }}>
      <div className="inline">
        {reused.map((r) => (
          <Link key={r.tool} href={relicHref(r.tool)} className="relic-chip">
            <Icon name="reuse_tool" small />
            <span className="mono">{r.tool}</span>
            <em>reused · from {r.madeForProcessName}</em>
          </Link>
        ))}
        {made.map((name) => (
          <Link key={name} href={relicHref(name)} className="relic-chip made">
            <Icon name="create_tool" small />
            <span className="mono">{name}</span>
            <em>made</em>
          </Link>
        ))}
      </div>
      <p className="figures">
        <span style={{ color: "var(--gilt)" }}>{reused.length} reused</span>
        <span className="ash"> · </span>
        <span className="ember">{made.length} made</span>
      </p>
    </div>
  );
}

export function RelicTile({
  tool,
  isNew,
  arrived,
  flash,
}: {
  tool: ToolSummary;
  isNew: boolean;
  arrived: boolean;
  flash: boolean;
}) {
  const reusedBy = tool.usedBy.filter((u) => u.origin === "reused");
  return (
    <Link
      href={relicHref(tool.name)}
      className={`tile ${arrived ? "arrived" : ""} ${flash ? "flash" : ""}`}
    >
      <span className="inline" style={{ justifyContent: "space-between" }}>
        <strong className="mono">{tool.name}</strong>
        <span className="inline">
          {isNew ? <Tag tone="new">New tonight</Tag> : null}
          <Tag>{tool.kind}</Tag>
          {tool.repairCount ? <Tag>Repaired</Tag> : null}
        </span>
      </span>
      <p>{tool.description}</p>
      <Sites sites={tool.sites} />
      {reusedBy.length ? (
        <p style={{ color: "var(--gilt)" }}>
          Reused by {reusedBy.map((u) => u.processName).join(", ")}
        </p>
      ) : null}
    </Link>
  );
}

// ───────────── Familiar panel ─────────────

function Verification({ session }: { session: MonsterRun }) {
  if (!session.verification.length) return null;
  return (
    <div className="verify">
      <p className="label">The lab checks the work without the Familiar</p>
      <ul>
        {session.verification.map((line) => (
          <li key={line.id}>
            <span>{line.text}</span>
            <strong className={line.outcome === "failed" ? "ember" : ""}>
              {line.outcome === "passed"
                ? "Passed"
                : line.outcome === "failed"
                  ? "Failed"
                  : "Checking…"}
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function waitLine(waits: WaitsFor | null): string {
  if (waits?.processName && waits.site) {
    return `Waits its turn. ${waits.processName} is using ${waits.site} first.`;
  }
  return "Waits for a free Familiar.";
}

/** One Familiar and what it is doing, in every panel state. `compact` is the form on the Process page. */
export function FamiliarPanel({
  process,
  session,
  waitsFor,
  failedRun,
  compact,
}: {
  process: ProcessSummary;
  session: MonsterRun | undefined;
  waitsFor?: WaitsFor | null;
  failedRun?: Run;
  compact?: boolean;
}) {
  const { client } = useLabContext();
  const now = useNow();
  const status = process.status;
  const header = (
    <div className="panel-head">
      <h3>
        {compact ? (
          "The Familiar"
        ) : (
          <Link href={processHref(process.id)}>{process.name}</Link>
        )}
      </h3>
      <ProcessChips status={status} />
    </div>
  );

  if (status === "queued") {
    return (
      <section className="card" aria-label={`${process.name}: waiting`}>
        {header}
        <p>{waitLine(waitsFor ?? null)}</p>
      </section>
    );
  }

  if (status === "failed_to_learn") {
    return (
      <section className="card" aria-label={`${process.name}: failed to learn`}>
        {header}
        <p style={{ color: "var(--vellum)" }}>{process.reason}</p>
        <div className="actions">
          <CommandButton
            label={compact ? "Raise the Familiar again" : "Raise it again"}
            pendingLabel="Raising…"
            run={() => client!.learn(process.id)}
          />
          {compact ? null : (
            <Button variant="ghost" href={processHref(process.id)}>
              Open the process
            </Button>
          )}
        </div>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="card">
        {header}
        <p>The Familiar has not reported yet.</p>
      </section>
    );
  }

  const working = status === "learning" || status === "repairing";
  const started = session.startedAt ? new Date(session.startedAt).getTime() : 0;
  const ended = session.endedAt ? new Date(session.endedAt).getTime() : now;
  const elapsed = started && ended > started ? duration(ended - started) : "—";
  const actions =
    status === "awaiting_seal"
      ? session.actions.slice(-3)
      : compact
        ? session.actions.slice(-5)
        : session.actions;
  const failedStep = failedRun?.steps.find(
    (s) => s.position === failedRun.failedStep,
  );

  return (
    <section className="card" aria-label={`${process.name}: Familiar`}>
      {header}
      <div className="panel-meta figures">
        <span>{session.kind === "repair" ? "Repairing" : "Learning"}</span>
        <span>{working ? `${elapsed} so far` : `took ${elapsed}`}</span>
        <span title={tokenTooltip(session.tokens)}>
          {count(session.tokens.total)} tokens
        </span>
      </div>
      {session.kind === "repair" && failedRun && failedStep ? (
        <p style={{ color: "var(--vellum)" }}>
          <Link href={runHref(process.id, failedRun.id)}>
            Run failed at step {roman(failedStep.position)},{" "}
            <span className="mono">{failedStep.tool}</span>.
          </Link>{" "}
          Mending that <Term word="Relic" /> only.
        </p>
      ) : null}
      {session.kind === "learn" ? (
        <div className="stack-sm" style={{ gap: "0.5rem" }}>
          <p className="label">
            <Term word="Relic">Relics</Term> in hand
          </p>
          <RelicsInHand session={session} />
        </div>
      ) : null}
      <ActionList
        actions={actions}
        short={compact || status === "awaiting_seal"}
      >
        <Verification session={session} />
      </ActionList>
      {status === "awaiting_seal" && !compact ? (
        <div>
          <Button href={processHref(process.id)}>Review and seal</Button>
        </div>
      ) : null}
      {compact && working ? (
        <p>
          <Link href="/lab">Watch in the Lab</Link>
        </p>
      ) : null}
    </section>
  );
}

// ───────────── Chain and run steps ─────────────

export function Chain({
  chain,
  check,
}: {
  chain: ChainStep[];
  check: Check | null;
}) {
  if (!chain.length) {
    return <p className="ash">The chain is not saved yet.</p>;
  }
  return (
    <div className="stack-sm">
      <ol className="steps">
        {chain.map((step) => (
          <li key={step.position}>
            <span className="numeral" aria-hidden="true">
              {roman(step.position)}
            </span>
            <div className="stack-sm" style={{ gap: "0.35rem" }}>
              <span className="inline">
                <span className="sr-only">Step {step.position}: </span>
                <Link href={relicHref(step.tool)} className="mono">
                  {step.tool}
                </Link>
                <span className="ash mono">v{step.version}</span>
                <Tag>{step.kind}</Tag>
                <Tag tone={step.origin}>{step.origin}</Tag>
              </span>
              <span className="ash">{step.description}</span>
            </div>
          </li>
        ))}
      </ol>
      {check ? (
        <p>
          <Term word="Proof" />: {check.description}.
        </p>
      ) : null}
    </div>
  );
}

export function RunSteps({
  steps,
  chain,
  openLast,
}: {
  steps: RunStep[];
  chain?: ChainStep[];
  /** Results closed by default, the last step open (the Seal panel). */
  openLast?: boolean;
}) {
  return (
    <ol className="steps">
      {steps.map((step, i) => {
        const origin = chain?.find((c) => c.position === step.position)?.origin;
        const tone =
          step.status === "failed"
            ? "failed"
            : step.status === "refused"
              ? "refused-step"
              : step.status === "not_reached"
                ? "unreached"
                : "";
        const facts = step.result.length ? (
          <Facts rows={step.result} tight />
        ) : null;
        return (
          <li key={step.position} className={tone}>
            <span className="numeral" aria-hidden="true">
              {roman(step.position)}
            </span>
            <div className="stack-sm" style={{ gap: "0.5rem" }}>
              <span className="inline">
                <span className="sr-only">Step {step.position}: </span>
                <Link href={relicHref(step.tool)} className="mono">
                  {step.tool}
                </Link>
                <span className="mono" style={{ opacity: 0.75 }}>
                  v{step.version}
                </span>
                {origin ? <Tag tone={origin}>{origin}</Tag> : null}
                {openLast ? null : <StepChip status={step.status} />}
              </span>
              {step.error ? <p>{step.error}</p> : null}
              {step.status === "refused" ? (
                <p>
                  Nothing left this machine. No repair was started: a Familiar
                  cannot repair its way to more access.
                </p>
              ) : null}
              {facts && openLast ? (
                <Disclosure
                  summary="What it returned"
                  open={i === steps.length - 1}
                >
                  {facts}
                </Disclosure>
              ) : (
                facts
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ───────────── Runs ─────────────

const KIND_TAG: Record<Run["kind"], string | null> = {
  verification: "Verification",
  run_now: "Run now",
  after_repair: "After repair",
  scheduled: null,
};

export function ModelCalls({ n }: { n: number }) {
  return (
    <span className={n === 0 ? "" : "ember"}>
      {n} model {n === 1 ? "call" : "calls"}
    </span>
  );
}

export function RunRow({ run, now }: { run: Run; now: number }) {
  const failed = run.steps.find((s) => s.position === run.failedStep);
  const refusal = run.refusals[0];
  const done = run.status !== "running" && run.status !== "pending";
  return (
    <li>
      <Link
        href={runHref(run.processId, run.id)}
        className={`row ${run.status === "refused" ? "slab" : ""}`}
      >
        <span className="stack-sm" style={{ gap: "0.3rem" }}>
          <span className="inline">
            <strong>{run.itemLabel}</strong>
            {KIND_TAG[run.kind] ? <Tag>{KIND_TAG[run.kind]}</Tag> : null}
          </span>
        </span>
        <RunChip status={run.status} />
        <span className="row-line figures">
          {when(run.startedAt, now)}
          {done ? (
            <>
              {" · "}
              {duration(run.durationMs)}
              {" · "}
              <ModelCalls n={run.modelCalls} />
            </>
          ) : null}
          {run.proofValue ? (
            <>
              {" · Proof: "}
              <strong style={{ color: "var(--vellum)" }}>
                {run.proofValue}
              </strong>
            </>
          ) : null}
          {run.status === "failed" && failed ? (
            <>
              {" · Failed at step "}
              {roman(failed.position)},{" "}
              <span className="mono">{failed.tool}</span>.
              {run.repairId ? " Repair record inside." : ""}
            </>
          ) : null}
          {run.status === "refused" && refusal ? (
            <>
              {" · Refused: "}
              <span className="mono">{refusal.site}</span>.{" "}
              <span className="mono">{refusal.tool}</span> tried to reach it.
            </>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

export function RunsList({ runs, firstAt }: { runs: Run[]; firstAt: string }) {
  const now = useNow();
  const [shown, setShown] = useState(20);
  if (!runs.length) {
    return (
      <p className="ash">
        No runs yet. The first comes at {firstAt}, or press Run now.
      </p>
    );
  }
  return (
    <div className="stack-sm">
      <ul className="rows">
        {runs.slice(0, shown).map((run) => (
          <RunRow key={run.id} run={run} now={now} />
        ))}
      </ul>
      {runs.length > shown ? (
        <div>
          <Button variant="ghost" small onClick={() => setShown((n) => n + 20)}>
            Older runs
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function lastRunWords(last: ProcessSummary["lastRun"]): React.ReactNode {
  if (!last) return "No runs yet";
  const word =
    last.status === "passed"
      ? "Passed"
      : last.status === "failed"
        ? "Failed"
        : last.status === "refused"
          ? "Refused"
          : "Running";
  return (
    <>
      {word} {clock(last.startedAt)} · {duration(last.durationMs)} ·{" "}
      <ModelCalls n={last.modelCalls} />
    </>
  );
}
