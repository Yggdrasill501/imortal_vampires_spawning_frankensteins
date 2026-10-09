"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Repair, Tool, ToolSummary } from "@repo/contract";
import { processHref, relicHref, runHref } from "@/components/parts";
import { Chip } from "@/components/status";
import {
  Button,
  Card,
  Disclosure,
  EmptyShelf,
  Facts,
  Read,
  Rule,
  SectionHead,
  Sites,
  Tag,
  Term,
} from "@/components/ui";
import { count, dateTime, plural } from "@/lib/format";
import { useLab } from "@/lib/lab/provider";

export function Reliquary() {
  const tools = useLab("reliquary", (client) => client.listTools());
  return (
    <section className="band hazed">
      <div className="wrap">
        <SectionHead
          label={
            <>
              The <Term word="Library" />
            </>
          }
          title={
            <>
              Every <Term word="Relic" /> the{" "}
              <Term word="Familiar">Familiars</Term> have made
            </>
          }
        >
          Small tools, one ability each, shared by every process. None was
          written by us.
        </SectionHead>
        <Read read={tools}>
          {(list) =>
            list.length === 0 ? (
              <div className="stack-sm">
                <EmptyShelf niches={12} />
                <p>
                  The Library is empty. No Relic exists until a Familiar makes
                  one.
                </p>
                <p className="ash">
                  No tools were written beforehand. Each agent builds the tools
                  it needs.
                </p>
                <div>
                  <Button href="/interview">Begin an interview</Button>
                </div>
              </div>
            ) : (
              <Bookcase tools={list} />
            )
          }
        </Read>
      </div>
    </section>
  );
}

/** A steady number from a name, so a book keeps its colour and size between visits. */
function seed(name: string): number {
  let n = 7;
  for (const ch of name) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return n;
}

const LEATHERS = ["blood", "oxblood", "moss", "ink", "umber", "ash"];
const NUMERALS = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

/** Every Relic is a closed book on the shelf. The one under the hand is read out on the plate below. */
function Bookcase({ tools }: { tools: ToolSummary[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const open = tools.find((t) => t.name === picked) ?? tools[0];
  return (
    <div className="stack">
      <ul className="bookcase" aria-label="Relics on the shelf">
        {tools.map((tool) => {
          const n = seed(tool.name);
          const tall = 20 + ((n >> 3) % 7) * 0.6;
          // The label runs between the ornament and the numeral. A monospace letter is about 0.62 of its size
          // long, so this is the largest size at which the whole name fits.
          const room = tall - 8.4 - 1.2;
          const size = Math.min(0.84, room / (tool.name.length * 0.62));
          return (
            <li key={tool.name}>
              <Link
                href={relicHref(tool.name)}
                className={`spine ${LEATHERS[n % LEATHERS.length]} ${open.name === tool.name ? "out" : ""}`}
                style={
                  {
                    "--tall": `${tall}rem`,
                    "--title": `${size.toFixed(3)}rem`,
                    "--thick": `${4.4 + ((n >> 6) % 4) * 0.5}rem`,
                  } as React.CSSProperties
                }
                onMouseEnter={() => setPicked(tool.name)}
                onFocus={() => setPicked(tool.name)}
                aria-label={`${tool.name}: ${tool.description}`}
              >
                <span className="spine-mark" aria-hidden="true">
                  {tool.kind === "writes" ? "✦" : "◇"}
                </span>
                <span className="spine-title mono">{tool.name}</span>
                <span className="spine-foot" aria-hidden="true">
                  {NUMERALS[tool.currentVersion] ?? tool.currentVersion}
                </span>
                {tool.repairCount ? <span className="spine-stitch" /> : null}
              </Link>
            </li>
          );
        })}
        <li className="candle" aria-hidden="true">
          <i />
        </li>
      </ul>

      <Card href={relicHref(open.name)} className="plate">
        <strong className="mono" style={{ fontSize: "1.05rem" }}>
          {open.name}
        </strong>
        <p>{open.description}</p>
        <Sites sites={open.sites} />
        <span className="inline">
          <Tag>{open.kind}</Tag>
          <Tag>v{open.currentVersion}</Tag>
          {open.repairCount ? <Tag tone="reused">Repaired</Tag> : null}
        </span>
        <span
          className="foot-line"
          title={open.usedBy.map((u) => u.processName).join(", ")}
        >
          Made by the Familiar of {open.createdBy.processName} · Used by{" "}
          {plural(open.usedBy.length, "process", "processes")} · Open the book
        </span>
      </Card>
    </div>
  );
}

function subscribeHash(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

function RepairRecord({
  repair,
  tool,
  marked,
}: {
  repair: Repair;
  tool: Tool;
  marked: boolean;
}) {
  return (
    <Card id={`repair-${repair.id}`} className={marked ? "gilded" : ""}>
      <span className="inline">
        <h3>Repair of {dateTime(repair.at)}</h3>
        {repair.result === "verified" ? (
          <Chip
            label="Verified"
            mark="stitch"
            tone="gilt-line"
            title="The lab verified the new version without the Familiar."
          />
        ) : (
          <Chip
            label="Not fixed"
            mark="struck"
            tone="ember-line"
            title="The Familiar could not fix it."
          />
        )}
      </span>
      <Facts
        rows={[
          { label: "What failed", value: repair.whatFailed },
          {
            label: "On which input",
            value: (
              <Link href={runHref(repair.processId, repair.failedRunId)}>
                {repair.itemLabel}
              </Link>
            ),
          },
          { label: "What changed", value: repair.whatChanged },
          {
            label: "Result",
            value:
              repair.result === "verified" ? (
                <>
                  Verified. v{repair.toVersion} is current.
                  {repair.retryRunId ? (
                    <>
                      {" "}
                      <Link href={runHref(repair.processId, repair.retryRunId)}>
                        The run after repair
                      </Link>
                    </>
                  ) : null}
                </>
              ) : (
                `Not fixed: ${repair.reason}`
              ),
          },
          {
            label: "Versions",
            value:
              repair.toVersion === null
                ? `v${repair.fromVersion}, unchanged`
                : `v${repair.fromVersion} → v${repair.toVersion}`,
          },
          { label: "Cost", value: `${count(repair.tokens.total)} tokens` },
        ]}
      />
      <span className="sr-only">Relic {tool.name}</span>
    </Card>
  );
}

function Detail({ tool }: { tool: Tool }) {
  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => "",
  );
  useEffect(() => {
    if (!hash.startsWith("#repair-")) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [hash, tool.repairs.length]);

  return (
    <>
      <div className="head">
        <p className="label">
          <Term word="Relic" />
        </p>
        <h1
          className="mono"
          style={{ fontSize: "clamp(1.4rem, 3.4vw, 2.3rem)", fontWeight: 600 }}
        >
          {tool.name}
        </h1>
        <Rule />
        <p>{tool.description}</p>
      </div>
      <div className="stack column">
        <Facts
          rows={[
            { label: "Sites", value: <Sites sites={tool.sites} /> },
            { label: "Kind", value: tool.kind },
            {
              label: "Made by",
              value: (
                <>
                  the Familiar of{" "}
                  <Link href={processHref(tool.createdBy.processId)}>
                    {tool.createdBy.processName}
                  </Link>
                  , {dateTime(tool.createdBy.at)}
                </>
              ),
            },
            {
              label: "Used by",
              value: (
                <span className="inline">
                  {tool.usedBy.map((u) => (
                    <span
                      key={u.processId}
                      className="inline"
                      style={{ gap: "0.35rem" }}
                    >
                      <Link href={processHref(u.processId)}>
                        {u.processName}
                      </Link>
                      <Tag tone={u.origin}>{u.origin}</Tag>
                    </span>
                  ))}
                </span>
              ),
            },
            { label: "Current version", value: `v${tool.currentVersion}` },
            {
              label: "Kept at",
              value: <span className="mono">{tool.codePath}</span>,
            },
          ]}
        />

        <section className="stack-sm">
          <h2>Versions</h2>
          {tool.versions.map((v) => (
            <Card key={v.version}>
              <span className="inline">
                <h3>v{v.version}</h3>
                {v.current ? (
                  <Tag tone="made">current</Tag>
                ) : (
                  <Tag>kept, not in use</Tag>
                )}
              </span>
              <p>
                Current since {dateTime(v.becameCurrentAt)} ·{" "}
                {v.origin.kind === "learn" ? (
                  <>
                    made while learning{" "}
                    <Link href={processHref(v.origin.processId)}>
                      {v.origin.processName}
                    </Link>
                  </>
                ) : (
                  <Link href={`#repair-${v.origin.repairId}`}>
                    made by a repair
                  </Link>
                )}
              </p>
              {v.examples.length ? (
                <Disclosure
                  summary={`Recorded examples (${v.examples.length})`}
                >
                  <div className="stack-sm">
                    {v.examples.map((example, i) => (
                      <div
                        key={i}
                        className="stack-sm"
                        style={{ gap: "0.2rem" }}
                      >
                        <p className="label">Input</p>
                        <Facts rows={example.input} tight />
                        <p className="label">Result</p>
                        <Facts rows={example.result} tight />
                      </div>
                    ))}
                  </div>
                </Disclosure>
              ) : (
                <p>
                  No examples yet. They are recorded when a process using this
                  Relic is sealed.
                </p>
              )}
            </Card>
          ))}
        </section>

        <section className="stack-sm">
          <h2>Repairs</h2>
          {tool.repairs.length ? (
            tool.repairs.map((repair) => (
              <RepairRecord
                key={repair.id}
                repair={repair}
                tool={tool}
                marked={hash === `#repair-${repair.id}`}
              />
            ))
          ) : (
            <p className="ash">Never repaired.</p>
          )}
        </section>
        <p>
          <Link href="/reliquary">Back to the Library</Link>
        </p>
      </div>
    </>
  );
}

export function RelicScreen() {
  const params = useParams<{ name: string }>();
  const name = decodeURIComponent(params.name);
  const tool = useLab(`relic:${name}`, (client) => client.getTool(name));
  return (
    <section className="band hazed">
      <div className="wrap">
        <Read read={tool}>{(data) => <Detail tool={data} />}</Read>
      </div>
    </section>
  );
}
