"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { Fact } from "@repo/contract";
import { LabError } from "@/lib/lab";
import { useLabContext } from "@/lib/lab/provider";
import { useBloodSpill } from "./blood";

// ───────────── Ornaments ─────────────

export function Diamond({
  form = "solid",
  pulse = false,
  className = "",
}: {
  form?: "solid" | "hollow" | "struck";
  pulse?: boolean;
  className?: string;
}) {
  return (
    <i
      aria-hidden="true"
      className={`diamond ${form === "solid" ? "" : form} ${pulse ? "pulse" : ""} ${className}`}
    />
  );
}

export function Rule() {
  return (
    <div className="rule" aria-hidden="true">
      <i className="diamond" />
    </div>
  );
}

/** Label, title, rule, one ash sentence: the opening of every screen. */
export function SectionHead({
  label,
  title,
  children,
  level = 1,
  after,
}: {
  label: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  level?: 1 | 2;
  after?: React.ReactNode;
}) {
  const Title = level === 1 ? "h1" : "h2";
  return (
    <div className={level === 1 ? "head" : "subhead"}>
      <p className="label">{label}</p>
      <Title>{title}</Title>
      {after}
      <Rule />
      {children ? <div className="ash">{children}</div> : null}
    </div>
  );
}

const GLOSSARY = {
  Familiar: "An AI agent that learns one process, or repairs one tool.",
  Relic: "A small tool the agent wrote. It does one thing.",
  Forge: "Where agents learn processes and repair tools.",
  Library: "The shared collection of all tools.",
  Invitation: "The sites you allowed, and their logins.",
  Seal: "Your confirmation that a result is correct.",
  Proof: "The value that must appear for a run to count as passed.",
} as const;
export type ThemedWord = keyof typeof GLOSSARY;
export const GLOSSARY_ENTRIES = Object.entries(GLOSSARY) as [
  ThemedWord,
  string,
][];

/** A themed name with a dotted underline and its plain meaning. */
export function Term({
  word,
  children,
}: {
  word: ThemedWord;
  children?: React.ReactNode;
}) {
  return (
    <abbr className="term" title={GLOSSARY[word]} tabIndex={0}>
      {children ?? word}
      <span className="sr-only"> ({GLOSSARY[word]})</span>
    </abbr>
  );
}

// ───────────── Buttons ─────────────

type Variant = "blood" | "ghost" | "ink";

interface ButtonProps {
  variant?: Variant;
  small?: boolean;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
  children: React.ReactNode;
  className?: string;
  autoFocus?: boolean;
}

export function Button({
  variant = "blood",
  small,
  href,
  onClick,
  disabled,
  title,
  type = "button",
  children,
  className = "",
  autoFocus,
}: ButtonProps) {
  const ref = useRef<HTMLElement | null>(null);
  useBloodSpill(ref, variant === "blood");
  const classes = `btn btn-${variant} ${small ? "btn-sm" : ""} ${className}`;
  const inner = (
    <>
      {variant === "blood" ? (
        <svg className="blood-svg" aria-hidden="true">
          <g filter="url(#goo3)" fill="url(#bloodfill)" />
        </svg>
      ) : null}
      {children}
    </>
  );
  if (href && !disabled) {
    return (
      <Link
        href={href}
        className={classes}
        title={title}
        ref={(node) => {
          ref.current = node;
        }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled}
      title={title}
      autoFocus={autoFocus}
      ref={(node) => {
        ref.current = node;
      }}
    >
      {inner}
    </button>
  );
}

export function TextButton({
  onClick,
  disabled,
  children,
  title,
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="btn-text"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

/**
 * Runs one command. Shows its pending form, cannot be pressed twice, and on
 * failure shows the lab's one-sentence reason beside the button. If the lab
 * says the state has changed, everything on screen is read again.
 */
export function useCommand<A extends unknown[]>(
  run: (...args: A) => Promise<unknown>,
  after?: () => void,
) {
  const { noteChanged } = useLabContext();
  const [pending, setPending] = useState(false);
  const [fault, setFault] = useState<string | null>(null);
  const busy = useRef(false);
  const send = async (...args: A): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    setFault(null);
    try {
      await run(...args);
      after?.();
      return true;
    } catch (error) {
      const problem =
        error instanceof LabError ? error : new LabError(String(error));
      setFault(problem.message);
      if (problem.code === "state_changed") noteChanged();
      return false;
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return { send, pending, fault, clear: () => setFault(null) };
}

export function CommandButton({
  label,
  pendingLabel,
  run,
  after,
  variant = "blood",
  small,
  disabled,
  title,
  note,
  text,
}: {
  label: React.ReactNode;
  pendingLabel: string;
  run: () => Promise<unknown>;
  after?: () => void;
  variant?: Variant;
  small?: boolean;
  disabled?: boolean;
  title?: string;
  /** A quiet line beside the button. */
  note?: React.ReactNode;
  /** Render as a text button. */
  text?: boolean;
}) {
  const command = useCommand(run, after);
  return (
    <span className="cmd">
      {text ? (
        <TextButton
          onClick={() => void command.send()}
          disabled={disabled || command.pending}
          title={title}
        >
          {command.pending ? pendingLabel : label}
        </TextButton>
      ) : (
        <Button
          variant={variant}
          small={small}
          onClick={() => void command.send()}
          disabled={disabled || command.pending}
          title={title}
        >
          {command.pending ? pendingLabel : label}
        </Button>
      )}
      {command.fault ? (
        <span className="fault" role="alert">
          {command.fault}
        </span>
      ) : note ? (
        <span className="ash">{note}</span>
      ) : null}
    </span>
  );
}

// ───────────── Small pieces ─────────────

export function Tag({
  tone,
  children,
}: {
  tone?: "made" | "reused" | "new";
  children: React.ReactNode;
}) {
  return <span className={`tag ${tone ?? ""}`}>{children}</span>;
}

export function SiteChip({ site }: { site: string }) {
  return <span className="site-chip">{site}</span>;
}

export function Sites({ sites }: { sites: string[] }) {
  if (!sites.length)
    return <span className="ash">No site. It works on what it is handed.</span>;
  return (
    <span className="inline">
      {sites.map((site) => (
        <SiteChip key={site} site={site} />
      ))}
    </span>
  );
}

export function Facts({
  rows,
  tight,
}: {
  rows: (Fact | { label: string; value: React.ReactNode })[];
  tight?: boolean;
}) {
  return (
    <dl className={`facts ${tight ? "tight" : ""}`}>
      {rows.map((row, i) => (
        <div key={`${row.label}-${i}`}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Card({
  href,
  children,
  className = "",
  id,
}: {
  href?: string;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  if (href) {
    return (
      <Link href={href} className={`card ${className}`} id={id}>
        {children}
      </Link>
    );
  }
  return (
    <div className={`card ${className}`} id={id}>
      {children}
    </div>
  );
}

/** The dashed niches of an empty Library; filled ones show the shelf filling. */
export function EmptyShelf({
  niches = 6,
  filled = 0,
}: {
  niches?: number;
  filled?: number;
}) {
  return (
    <div
      className="shelf"
      role="img"
      aria-label={`${niches} niches in the Library, ${Math.min(filled, niches)} filled`}
    >
      {Array.from({ length: niches }, (_, i) => (
        <span key={i} className={`niche ${i < filled ? "filled" : ""}`} />
      ))}
    </div>
  );
}

export function Disclosure({
  summary,
  children,
  open,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  open?: boolean;
}) {
  return (
    <details open={open}>
      <summary
        className="btn-text"
        style={{ display: "inline-flex", alignItems: "center" }}
      >
        {summary}
      </summary>
      <div style={{ paddingTop: "0.8rem" }}>{children}</div>
    </details>
  );
}

// ───────────── The three base states ─────────────

export function Loading() {
  return (
    <div role="status" aria-live="polite">
      <div className="loading-rows" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <p className="ash">Reading the ledger…</p>
    </div>
  );
}

export function ReadError({
  error,
  retry,
}: {
  error: LabError;
  retry: () => void;
}) {
  return (
    <div className="stack-sm" role="alert">
      <h2>The lab did not answer.</h2>
      {error.message !== "The lab did not answer." ? (
        <p className="ash">{error.message}</p>
      ) : null}
      <div>
        <Button variant="ghost" onClick={retry}>
          Ask again
        </Button>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="stack-sm">
      <h1>Nothing by that name lives here.</h1>
      <Rule />
      <p>
        <Link href="/">Back to Tonight</Link>
      </p>
    </div>
  );
}

/** Renders loading, error or not-found, or the children once there is data. */
export function Read<T>({
  read,
  children,
}: {
  read: {
    data: T | undefined;
    error: LabError | null;
    notFound: boolean;
    reload(): void;
  };
  children: (data: T) => React.ReactNode;
}) {
  if (read.data !== undefined) return <>{children(read.data)}</>;
  if (read.notFound) return <NotFound />;
  if (read.error) return <ReadError error={read.error} retry={read.reload} />;
  return <Loading />;
}

// ───────────── Confirm dialog ─────────────

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Keep it",
  run,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  cancelLabel?: string;
  run: () => Promise<unknown>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const command = useCommand(run, onClose);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="confirm"
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <div className="stack-sm">
        <h3 id={titleId}>{title}</h3>
        <p className="ash">{children}</p>
        {command.fault ? (
          <p className="fault" role="alert">
            {command.fault}
          </p>
        ) : null}
        <div className="actions">
          <Button
            onClick={() => void command.send()}
            disabled={command.pending}
          >
            {command.pending ? pendingLabel : confirmLabel}
          </Button>
          <Button variant="ghost" onClick={onClose} autoFocus>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

// ───────────── Line icons (44-unit square, stroke only) ─────────────

const ICONS = {
  search_shelf: "M19 8a11 11 0 1 0 0 22 11 11 0 0 0 0-22ZM27 27l10 10",
  open_page: "M9 6h18l8 8v24H9ZM27 6v8h8M15 22h14M15 29h14",
  click: "M14 6v22l6-5 5 13 4-2-5-12h9Z",
  type: "M5 13h34v18H5ZM11 22h4M19 22h4M27 22h6",
  read: "M4 22s7-11 18-11 18 11 18 11-7 11-18 11S4 22 4 22ZM22 17a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z",
  reuse_tool:
    "M18 26l8-8M16 19l-5 5a6 6 0 0 0 9 9l5-5M28 25l5-5a6 6 0 0 0-9-9l-5 5",
  create_tool: "M22 4l4 13 13 5-13 5-4 13-4-13-13-5 13-5Z",
  test_tool:
    "M17 5h10M19 5v12L9 35a3 3 0 0 0 3 4h20a3 3 0 0 0 3-4L25 17V5M14 28h16",
  save_process: "M8 6h24l6 6v26H8ZM14 6v10h14V6M14 38V26h16v12",
  refused: "M22 5a17 17 0 1 0 0 34 17 17 0 0 0 0-34ZM10 10l24 24",
  relic: "M15 5h14l8 10v14l-8 10H15L7 29V15ZM22 12v18M16 18h12",
  castle:
    "M8 40V18l3-3V6l2 6v3l3 3V9l3 7v24M25 40V16l3-7v9l3-3V12l2-6v9l3 3v22M19 40v-8a3 3 0 0 1 6 0v8M4 40h36",
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, small }: { name: IconName; small?: boolean }) {
  return (
    <svg
      className={`icon ${small ? "sm" : ""}`}
      viewBox="0 0 44 44"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
