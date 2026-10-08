"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { Refusal } from "@repo/contract";
import { readRefusals } from "@/components/frame";
import { processHref, runHref } from "@/components/parts";
import { Diamond, Read, SectionHead, Term } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { useLab, useRefusalsSeenAt } from "@/lib/lab/provider";

const STAGE: Record<Refusal["stage"], string> = {
  install: "When the Relic was being installed",
  run: "During a run",
  explore: "While a Familiar explored",
};

export function Refused() {
  const refusals = useLab("refused", readRefusals, {
    refreshOn: (e) => e.kind === "refusal",
  });
  const [seenAt, setSeenAt] = useRefusalsSeenAt();
  const newestAt = refusals.data?.[0]?.at;
  // Opening this screen marks every refusal as seen, a moment later, so the new ones can be told apart first.
  useEffect(() => {
    if (!newestAt) return;
    const timer = setTimeout(
      () => setSeenAt(new Date(newestAt).getTime()),
      4000,
    );
    return () => clearTimeout(timer);
  }, [newestAt, setSeenAt]);

  return (
    <section className="band hazed">
      <div className="wrap">
        <SectionHead label="Refused" title="Turned away at the threshold">
          Every attempt to reach a site that is not in the{" "}
          <Term word="Invitation" />. Each was stopped before it left this
          machine.
        </SectionHead>
        <Read read={refusals}>
          {(list) =>
            list.length === 0 ? (
              <div className="stack-sm">
                <h2>Nothing has been turned away.</h2>
                <p className="ash">
                  No attempt has been made to reach a site outside the
                  Invitation.
                </p>
              </div>
            ) : (
              <ul
                className="stack-sm column"
                style={{ listStyle: "none", padding: 0, margin: 0 }}
                aria-live="assertive"
              >
                {list.map((r) => (
                  <li
                    key={r.id}
                    className="slab stack-sm"
                    style={{ gap: "0.5rem", padding: "1.4rem 1.6rem" }}
                  >
                    <span className="inline">
                      {new Date(r.at).getTime() > seenAt ? (
                        <>
                          <Diamond className="ember" />
                          <span className="sr-only">New. </span>
                        </>
                      ) : null}
                      <strong
                        className="mono"
                        style={{ fontSize: "1.5rem", color: "var(--vellum)" }}
                      >
                        {r.site}
                      </strong>
                    </span>
                    <p>
                      <span className="label" style={{ color: "#f1b9b2" }}>
                        What tried
                      </span>{" "}
                      {r.tool ? (
                        <>
                          <span className="mono">{r.tool}</span>
                          {r.version ? ` v${r.version}` : ""}, for{" "}
                        </>
                      ) : (
                        "A Familiar, for "
                      )}
                      {r.processName}
                    </p>
                    <p>
                      <span className="label" style={{ color: "#f1b9b2" }}>
                        When
                      </span>{" "}
                      {STAGE[r.stage]} · {dateTime(r.at)}
                    </p>
                    <p>
                      {r.runId ? (
                        <Link href={runHref(r.processId, r.runId)}>
                          See the run
                        </Link>
                      ) : (
                        <Link href={processHref(r.processId)}>
                          See the process
                        </Link>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )
          }
        </Read>
      </div>
    </section>
  );
}
