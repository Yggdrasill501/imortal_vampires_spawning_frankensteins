"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import type {
  Interview,
  Invitation,
  InvitationSiteInput,
  ProcessSummary,
} from "@repo/contract";
import {
  draftOf,
  InvitationForm,
  keepAll,
  type FormRow,
  type InvitationDraft,
} from "@/components/invitation-form";
import { processHref } from "@/components/parts";
import { ProcessChips } from "@/components/status";
import {
  Button,
  Card,
  Diamond,
  Disclosure,
  Read,
  SectionHead,
  Sites,
  TextButton,
  Term,
  useCommand,
} from "@/components/ui";
import { clock, numberWord, scheduleWords } from "@/lib/format";
import { useLab, useLabContext } from "@/lib/lab/provider";

export function TranscriptView({
  interview,
}: {
  interview: Pick<Interview, "transcript" | "language">;
}) {
  return (
    <div className="transcript" lang={interview.language}>
      {interview.transcript.map((turn, i) => (
        <div key={i} className={`turn ${turn.speaker === "user" ? "you" : ""}`}>
          <span className="label" lang="en">
            {turn.speaker === "user" ? "You" : "The house"}
          </span>
          <p>{turn.text}</p>
        </div>
      ))}
    </div>
  );
}

function ProposedCard({
  process,
  readOnly,
}: {
  process: ProcessSummary;
  readOnly: boolean;
}) {
  const { client, rereadAll } = useLabContext();
  const [asking, setAsking] = useState(false);
  const strike = useCommand(() => client!.removeProcess(process.id), rereadAll);
  return (
    <Card>
      <span className="inline" style={{ justifyContent: "space-between" }}>
        <h3>{process.name}</h3>
        {readOnly ? (
          <ProcessChips status={process.status} repaired={process.repaired} />
        ) : null}
      </span>
      <p style={{ color: "var(--vellum)" }}>{process.description}</p>
      <Sites sites={process.sites.map((s) => s.site)} />
      <p>
        <span className="label">
          <Term word="Proof" />
        </span>{" "}
        {process.successCriterion}{" "}
        <span className="ash">(How you know it worked)</span>
      </p>
      <p>{scheduleWords(process.schedule)}</p>
      {readOnly ? (
        <p>
          <Link href={processHref(process.id)}>Open the process</Link>
        </p>
      ) : asking ? (
        <span className="cmd">
          Strike it out?
          <TextButton
            onClick={() => void strike.send()}
            disabled={strike.pending}
          >
            {strike.pending ? "Striking…" : "Yes"}
          </TextButton>
          <TextButton onClick={() => setAsking(false)}>Keep it</TextButton>
          {strike.fault ? (
            <span className="fault" role="alert">
              {strike.fault}
            </span>
          ) : null}
        </span>
      ) : (
        <div>
          <Button variant="ghost" small onClick={() => setAsking(true)}>
            Strike it out
          </Button>
        </div>
      )}
    </Card>
  );
}

function Invite({
  interview,
  invitation,
  proposed,
}: {
  interview: Interview;
  invitation: Invitation;
  proposed: ProcessSummary[];
}) {
  const { client } = useLabContext();
  const router = useRouter();
  const [draft, setDraft] = useState<InvitationDraft>({});
  const [stored, setStored] = useState(false);

  // Exactly the sites the remaining processes need. Sites already invited show as such; their logins are kept.
  const rows: FormRow[] = [];
  for (const p of proposed) {
    for (const need of p.sites) {
      let row = rows.find((r) => r.site === need.site);
      if (!row) {
        const had = invitation.sites.find((s) => s.site === need.site);
        row = {
          ...need,
          loginHeld: had?.loginHeld ?? false,
          grantedAt: had?.grantedAt ?? null,
          neededBy: [],
        };
        rows.push(row);
      }
      row.neededBy.push({ name: p.name, retired: false });
    }
  }
  const others = invitation.sites.filter(
    (s) => !rows.some((r) => r.site === s.site),
  );

  let blocked: string | null = null;
  for (const row of rows) {
    const value = draftOf(draft, row.site);
    if (!row.grantedAt && !value.ticked) {
      blocked = `Missing: ${row.site}. ${row.neededBy[0].name} needs it.`;
      break;
    }
  }
  if (!blocked) {
    for (const row of rows) {
      const value = draftOf(draft, row.site);
      const typed = Boolean(value.name && value.password);
      if (row.loginNeeded && !typed && (!row.loginHeld || value.changing)) {
        blocked = `${row.site} needs a login`;
        break;
      }
    }
  }

  const start = useCommand(async () => {
    if (!stored) {
      // PUT takes the complete set: everything already invited, plus what these processes need.
      const sites: InvitationSiteInput[] = keepAll(invitation).filter(
        (s) => !rows.some((r) => r.site === s.site),
      );
      for (const row of rows) {
        const value = draftOf(draft, row.site);
        const typed = Boolean(value.name && value.password);
        sites.push({
          site: row.site,
          kind: row.kind,
          login:
            row.loginNeeded && typed
              ? { name: value.name, password: value.password }
              : undefined,
        });
      }
      await client!.putInvitation({ sites });
      setStored(true);
      setDraft({}); // The logins leave the page the moment they are sent.
    }
    await client!.startInterview(interview.id);
    router.push("/lab");
  });

  return (
    <section className="stack-sm">
      <h2>
        The <Term word="Invitation" />
      </h2>
      {stored ? (
        <p>The Invitation is stored. The Familiars did not start.</p>
      ) : (
        <>
          <InvitationForm
            mode="embedded"
            rows={rows}
            draft={draft}
            onDraft={setDraft}
          />
          {others.length ? (
            <p className="ash">
              {numberWord(others.length)} other invited{" "}
              {others.length === 1 ? "site stays" : "sites stay"} as{" "}
              {others.length === 1 ? "it is" : "they are"}:{" "}
              {others.map((s) => s.site).join(", ")}.
            </p>
          ) : null}
        </>
      )}
      <div className="cmd" style={{ marginTop: "0.8rem" }}>
        <Button
          onClick={() => void start.send()}
          disabled={start.pending || (!stored && Boolean(blocked))}
        >
          {start.pending
            ? "Inviting…"
            : stored
              ? "Start them"
              : (blocked ?? "Invite and start")}
        </Button>
        {start.fault ? (
          <span className="fault" role="alert">
            {start.fault}
          </span>
        ) : null}
      </div>
      <p className="ash">
        This is the moment it is let in. Only these sites, only with these
        logins.
      </p>
    </section>
  );
}

function Body({
  interview,
  invitation,
}: {
  interview: Interview;
  invitation: Invitation | undefined;
}) {
  const proposed = interview.processes.filter((p) => p.status === "proposed");
  const started = interview.invitedAt !== null;
  const n = interview.processes.length;
  const title =
    interview.status === "being_read"
      ? "It is still reading."
      : interview.status === "nothing_found"
        ? "It heard no process in that."
        : started
          ? `${numberWord(n)} ${n === 1 ? "task" : "tasks"}, already invited.`
          : proposed.length === 0
            ? "Nothing is left to start."
            : `${numberWord(proposed.length)} ${proposed.length === 1 ? "task" : "tasks"}. Keep the ones you want.`;
  const shown = started ? interview.processes : proposed;

  return (
    <>
      <SectionHead label="What it heard" title={title}>
        {started
          ? "The Familiars have been let in."
          : "Nothing has touched any site yet."}
      </SectionHead>
      <div className="stack column">
        <Disclosure summary="Read the transcript">
          <TranscriptView interview={interview} />
        </Disclosure>

        {interview.status === "being_read" ? (
          interview.readError ? (
            <div className="stack-sm" role="alert">
              <p>The lab could not read it. Nothing is lost.</p>
              <p className="ash">{interview.readError}</p>
              <div>
                <Button
                  href={`/interview?from=${encodeURIComponent(interview.id)}`}
                >
                  Continue the interview
                </Button>
              </div>
            </div>
          ) : (
            <p className="inline" role="status">
              <Diamond pulse className="ember" />
              The transcript is being read. This takes a minute or two.
            </p>
          )
        ) : null}

        {interview.status === "nothing_found" ? (
          <div>
            <Button
              href={`/interview?from=${encodeURIComponent(interview.id)}`}
            >
              Continue the interview
            </Button>
          </div>
        ) : null}

        {interview.status === "proposed" &&
        !started &&
        proposed.length === 0 ? (
          <div>
            <Button href="/interview">Begin an interview</Button>
          </div>
        ) : null}

        {shown.length ? (
          <div className="stack-sm">
            {shown.map((p) => (
              <ProposedCard key={p.id} process={p} readOnly={started} />
            ))}
          </div>
        ) : null}

        {started ? (
          <p>
            Invited at {clock(interview.invitedAt)}.{" "}
            <Link href="/invitation">See the Invitation</Link>
          </p>
        ) : proposed.length && invitation ? (
          <Invite
            interview={interview}
            invitation={invitation}
            proposed={proposed}
          />
        ) : null}
      </div>
    </>
  );
}

export function Review() {
  const { id } = useParams<{ id: string }>();
  const interview = useLab(
    `interview:${id}`,
    (client) => client.getInterview(id),
    {
      refreshOn: (e) =>
        e.kind === "interview.status" || e.kind === "process.status",
    },
  );
  const invitation = useLab(
    "review:invitation",
    (client) => client.getInvitation(),
    { refreshOn: () => false },
  );
  return (
    <section className="band hazed">
      <div className="wrap">
        <Read read={interview}>
          {(data) => <Body interview={data} invitation={invitation.data} />}
        </Read>
      </div>
    </section>
  );
}
