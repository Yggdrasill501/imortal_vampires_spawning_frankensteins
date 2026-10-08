"use client";

import Link from "next/link";
import { readRefusals } from "@/components/frame";
import { InvitationForm } from "@/components/invitation-form";
import { Read, SectionHead, Term } from "@/components/ui";
import { useLab } from "@/lib/lab/provider";

export function InvitationScreen() {
  const invitation = useLab("invitation", (client) => client.getInvitation());
  const refusals = useLab("invitation:refusals", readRefusals, {
    refreshOn: (e) => e.kind === "refusal",
  });
  return (
    <section className="band hazed">
      <div className="wrap">
        <SectionHead
          label={
            <>
              The <Term word="Invitation" />
            </>
          }
          title="It only enters where it is invited."
        >
          These are the only sites anything here can reach. Only you can change
          this, and only here.
        </SectionHead>
        <div className="column stack-sm">
          <Read read={invitation}>
            {(data) =>
              data.sites.length === 0 ? (
                <div className="stack-sm">
                  <h2>
                    No one has been invited. Nothing here can reach any site.
                  </h2>
                  <p className="ash">
                    Sites are invited after an interview, before any Familiar
                    starts.
                  </p>
                </div>
              ) : (
                <InvitationForm
                  mode="standalone"
                  invitation={data}
                  rows={data.sites.map((s) => ({
                    ...s,
                    neededBy: s.neededBy.map((p) => ({
                      name: p.name,
                      retired: p.status === "retired",
                    })),
                  }))}
                />
              )
            }
          </Read>
          <p>
            <Link href="/refused">
              Turned away so far: {refusals.data?.length ?? "…"}.
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
