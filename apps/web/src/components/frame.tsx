"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import type { Refusal } from "@repo/contract";
import { WORKING_STATUSES } from "@repo/contract";
import type { LabClient, MockScenario } from "@/lib/lab";
import {
  useIsLive,
  useLab,
  useLabContext,
  useRefusalsSeenAt,
} from "@/lib/lab/provider";
import { SpillDefs } from "./blood";
import { Button, Diamond, GLOSSARY_ENTRIES } from "./ui";

/** Every refusal, newest first, gathered from the runs and Familiar sessions they belong to. */
export async function readRefusals(client: LabClient): Promise<Refusal[]> {
  const [runs, sessions] = await Promise.all([
    client.listRuns(),
    client.listMonsterRuns(),
  ]);
  return [
    ...runs.flatMap((r) => r.refusals),
    ...sessions.flatMap((s) => s.refusals),
  ].sort((a, b) => b.at.localeCompare(a.at));
}

export function Wordmark() {
  return (
    <span>
      imortal<b>_</b>vampires<b>_</b>spawning<b>_</b>frankenstains
    </span>
  );
}

const LINKS = [
  { href: "/lab", label: "Lab" },
  { href: "/reliquary", label: "Reliquary" },
  { href: "/invitation", label: "Invitation" },
  { href: "/refused", label: "Refused" },
];

interface NavProps {
  working: boolean;
  unseen: number;
  className?: string;
}

/** The current path is URL data, so the part that reads it sits behind Suspense. */
function NavLinks(props: NavProps) {
  return (
    <Suspense fallback={<NavList {...props} path="" />}>
      <NavListWithPath {...props} />
    </Suspense>
  );
}
function NavListWithPath(props: NavProps) {
  return <NavList {...props} path={usePathname()} />;
}
function NavList({
  working,
  unseen,
  className,
  path,
}: NavProps & { path: string }) {
  return (
    <ul className={`nav-links ${className ?? ""}`}>
      {LINKS.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            aria-current={
              path && path.startsWith(link.href) ? "page" : undefined
            }
          >
            {link.label}
            {link.href === "/lab" && working ? (
              <>
                <Diamond pulse className="ember" />
                <span className="sr-only">A Familiar is working</span>
              </>
            ) : null}
            {link.href === "/refused" && unseen > 0 ? (
              <span
                className="nav-count"
                aria-label={`${unseen} not yet looked at`}
              >
                {unseen}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ConnectionBar() {
  const { connection, changed } = useLabContext();
  if (connection === "dropped") {
    return (
      <div className="bar" role="status">
        <div className="wrap">
          <strong>The line to the lab has gone quiet. Trying again…</strong>
          <span className="ash">
            Live updates are paused. What you see may be out of date.
          </span>
        </div>
      </div>
    );
  }
  if (connection === "unreachable") {
    return (
      <div className="bar" role="status">
        <div className="wrap">
          <strong>The lab does not answer.</strong>
          <span className="ash">
            Start the lab service. This page wakes by itself.
          </span>
        </div>
      </div>
    );
  }
  if (connection === "restored") {
    return (
      <div className="bar" role="status">
        <div className="wrap">The lab answers again.</div>
      </div>
    );
  }
  if (changed) {
    return (
      <div className="bar" role="status">
        <div className="wrap">
          This changed while you were looking. The page is now up to date.
        </div>
      </div>
    );
  }
  return null;
}

function HealthLine() {
  const { connection } = useLabContext();
  const health = useLab("health", (client) => client.health(), {
    refreshOn: () => false,
  });
  if (
    connection === "dropped" ||
    connection === "unreachable" ||
    health.error
  ) {
    return <span>The lab does not answer.</span>;
  }
  if (!health.data) return <span>Asking the lab…</span>;
  return (
    <span>
      The lab answers. Its database{" "}
      {health.data.database === "ok" ? "answers" : "does not"}.
    </span>
  );
}

const SCENARIOS: { key: MockScenario; label: string }[] = [
  { key: "empty", label: "Empty first run" },
  { key: "story", label: "Story: an interview being read" },
  { key: "full", label: "Full: a night already behind us" },
];

/** Shown whenever the simulation is active, so it is never mistaken for the real thing. */
function MockMarker() {
  const { client, rereadAll, connection } = useLabContext();
  const mock = client?.mock;
  if (!mock) return null;
  return (
    <details className="mock-marker">
      <summary>
        <Diamond form="hollow" />
        Simulated data
      </summary>
      <div className="inner">
        <span>
          Nothing here is real. No lab service is running; the records are made
          up in this tab. Scenario: <strong>{mock.scenario}</strong>.
        </span>
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => {
              mock.restart(s.key);
              rereadAll();
            }}
          >
            Start again: {s.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => mock.setLineCut(connection !== "dropped")}
        >
          {connection === "dropped"
            ? "Restore the line to the lab"
            : "Cut the line to the lab"}
        </button>
      </div>
    </details>
  );
}

function RefusalBar({ newest }: { newest: Refusal }) {
  const path = usePathname();
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (path === "/refused" || dismissed === newest.id) return null;
  return (
    <div className="bar refusal" role="alert">
      <div className="wrap">
        <span>
          Refused: <span className="mono">{newest.site}</span>.{" "}
          {newest.tool ? (
            <>
              <span className="mono">{newest.tool}</span> tried to reach it.
            </>
          ) : (
            "Something tried to reach it."
          )}
        </span>
        <Link href="/refused">See</Link>
        <button
          type="button"
          className="btn-text"
          style={{ minHeight: 0, padding: 0 }}
          onClick={() => setDismissed(newest.id)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export function AppFrame({ children }: { children: React.ReactNode }) {
  const live = useIsLive();
  const processes = useLab(
    "frame:processes",
    (client) => client.listProcesses(),
    {
      refreshOn: (event) => event.kind === "process.status",
    },
  );
  const refusals = useLab("frame:refusals", readRefusals, {
    refreshOn: (event) => event.kind === "refusal",
  });
  const [seenAt] = useRefusalsSeenAt();

  const working = Boolean(
    processes.data?.some((p) => WORKING_STATUSES.includes(p.status)),
  );
  const unseen = useMemo(
    () =>
      (refusals.data ?? []).filter((r) => new Date(r.at).getTime() > seenAt),
    [refusals.data, seenAt],
  );
  const newest = unseen[0];

  return (
    <div className={live ? "" : "quiet"} style={{ display: "contents" }}>
      <SpillDefs />
      <header className="topbar">
        <div className="wrap">
          <nav className="nav" aria-label="Main">
            <Link
              className="brand"
              href="/"
              aria-label="imortal vampires spawning frankenstains: Tonight"
            >
              <Wordmark />
            </Link>
            <NavLinks
              working={working}
              unseen={unseen.length}
              className="wide"
            />
            <Button href="/interview" small>
              Begin an interview
            </Button>
            <details className="nav-menu">
              <summary>
                Menu
                {unseen.length ? (
                  <span className="nav-count" style={{ marginLeft: "0.5rem" }}>
                    {unseen.length}
                  </span>
                ) : null}
              </summary>
              <NavLinks working={working} unseen={unseen.length} />
              <ul
                style={{
                  top: "auto",
                  position: "static",
                  border: 0,
                  padding: 0,
                  minWidth: 0,
                }}
                className="nav-links"
              >
                <li>
                  <Link href="/interview">Begin an interview</Link>
                </li>
              </ul>
            </details>
          </nav>
        </div>
      </header>
      <div className="bars">
        <ConnectionBar />
        {newest ? (
          <Suspense fallback={null}>
            <RefusalBar newest={newest} />
          </Suspense>
        ) : null}
      </div>
      <main id="main" style={{ flex: 1 }}>
        {children}
      </main>
      <footer className="foot">
        <div className="wrap">
          <span>Runs on this machine. One user. No sign-in.</span>
          <HealthLine />
          <details className="glossary">
            <summary
              className="btn-text"
              style={{ display: "inline-flex", alignItems: "center" }}
            >
              What the words mean
            </summary>
            <dl className="facts tight column">
              {GLOSSARY_ENTRIES.map(([word, plain]) => (
                <div key={word}>
                  <dt>{word}</dt>
                  <dd>{plain}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
      </footer>
      <MockMarker />
    </div>
  );
}
