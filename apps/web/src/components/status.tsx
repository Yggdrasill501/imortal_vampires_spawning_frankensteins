import Link from "next/link";
import type {
  LatestRepair,
  ProcessStatus,
  RunStatus,
  RunStepStatus,
} from "@repo/contract";
import { dateOnly } from "@/lib/format";

type Mark =
  | "hollow"
  | "solid"
  | "pulse"
  | "struck"
  | "seal"
  | "square"
  | "barred"
  | "stitch";

function MarkGlyph({ mark }: { mark: Mark }) {
  if (mark === "seal") return <i aria-hidden="true" className="mark-seal" />;
  if (mark === "square")
    return <i aria-hidden="true" className="mark-square" />;
  if (mark === "barred")
    return <i aria-hidden="true" className="mark-barred" />;
  if (mark === "stitch")
    return <i aria-hidden="true" className="mark-stitch" />;
  return (
    <i
      aria-hidden="true"
      className={`diamond ${mark === "hollow" ? "hollow" : mark === "struck" ? "struck" : ""} ${mark === "pulse" ? "pulse" : ""}`}
    />
  );
}

export function Chip({
  label,
  mark,
  tone,
  title,
  href,
  stamp,
}: {
  label: string;
  mark: Mark;
  tone: string;
  title: string;
  href?: string;
  stamp?: boolean;
}) {
  const className = `chip ${tone} ${stamp ? "stamp" : ""}`;
  const inner = (
    <>
      <MarkGlyph mark={mark} />
      {label}
    </>
  );
  return href ? (
    <Link href={href} className={className} title={title}>
      {inner}
    </Link>
  ) : (
    <span className={className} title={title}>
      {inner}
    </span>
  );
}

const PROCESS: Record<
  ProcessStatus,
  { label: string; mark: Mark; tone: string; title: string }
> = {
  proposed: {
    label: "Heard",
    mark: "hollow",
    tone: "ash",
    title: "Proposed from your interview. Nothing has run.",
  },
  queued: {
    label: "Waiting",
    mark: "hollow",
    tone: "",
    title: "Invited. Waiting for a Familiar.",
  },
  learning: {
    label: "Familiar at work",
    mark: "pulse",
    tone: "ember",
    title: "An agent is learning this process.",
  },
  awaiting_seal: {
    label: "Awaiting your Seal",
    mark: "solid",
    tone: "gilt-line",
    title: "Verified by the lab. Waiting for you to confirm.",
  },
  failed_to_learn: {
    label: "Failed to learn",
    mark: "struck",
    tone: "ember-line",
    title: "The result did not pass verification.",
  },
  sealed: {
    label: "Sealed",
    mark: "seal",
    tone: "sealed",
    title: "Live. Runs on its schedule with no model.",
  },
  repairing: {
    label: "Familiar repairing",
    mark: "pulse",
    tone: "ember",
    title: "A Familiar is fixing a broken Relic. The schedule waits.",
  },
  needs_human: {
    label: "Needs a human",
    mark: "square",
    tone: "inverted",
    title: "Paused. One sentence says why.",
  },
  retired: {
    label: "Retired",
    mark: "hollow",
    tone: "dim",
    title: "Stopped by you. History is kept.",
  },
};

export function ProcessChips({
  status,
  repaired,
  latestRepair,
  stamp,
}: {
  status: ProcessStatus;
  repaired?: boolean;
  latestRepair?: LatestRepair | null;
  stamp?: boolean;
}) {
  const chip = PROCESS[status];
  return (
    <span
      className="inline"
      role={status === "needs_human" ? "alert" : undefined}
    >
      <Chip {...chip} stamp={stamp && status === "sealed"} />
      {repaired && status === "sealed" ? (
        <Chip
          label="Repaired"
          mark="stitch"
          tone="gilt-line"
          href={
            latestRepair
              ? `/reliquary/${encodeURIComponent(latestRepair.tool)}#repair-${latestRepair.id}`
              : undefined
          }
          title={
            latestRepair
              ? `Repaired ${dateOnly(latestRepair.at)}. ${latestRepair.tool} v${latestRepair.fromVersion} → v${latestRepair.toVersion}.`
              : "A Relic broke and was fixed without you."
          }
        />
      ) : null}
    </span>
  );
}

const RUN: Record<
  RunStatus,
  { label: string; mark: Mark; tone: string; title: string }
> = {
  pending: {
    label: "Running",
    mark: "pulse",
    tone: "",
    title: "A run is in progress.",
  },
  running: {
    label: "Running",
    mark: "pulse",
    tone: "",
    title: "A run is in progress.",
  },
  passed: {
    label: "Passed",
    mark: "solid",
    tone: "",
    title: "The Proof was present.",
  },
  failed: {
    label: "Failed",
    mark: "struck",
    tone: "ember-line",
    title: "A Relic failed at a step.",
  },
  refused: {
    label: "Refused",
    mark: "barred",
    tone: "refused",
    title: "It tried to reach a site outside the Invitation.",
  },
};

export function RunChip({ status }: { status: RunStatus }) {
  return <Chip {...RUN[status]} />;
}

const STEP: Record<
  RunStepStatus,
  { label: string; mark: Mark; tone: string; title: string }
> = {
  running: {
    label: "Running",
    mark: "pulse",
    tone: "",
    title: "This step is running.",
  },
  passed: {
    label: "Passed",
    mark: "solid",
    tone: "",
    title: "This step gave its result.",
  },
  failed: {
    label: "Failed",
    mark: "struck",
    tone: "ember-line",
    title: "The Relic failed here.",
  },
  refused: {
    label: "Refused",
    mark: "barred",
    tone: "refused",
    title: "It tried to reach a site outside the Invitation.",
  },
  not_reached: {
    label: "Not reached",
    mark: "hollow",
    tone: "ash",
    title: "The run stopped before this step.",
  },
};

export function StepChip({ status }: { status: RunStepStatus }) {
  return <Chip {...STEP[status]} />;
}
