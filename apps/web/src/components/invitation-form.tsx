"use client";

import { useId, useState } from "react";
import type { Invitation, InvitationSiteInput, SiteRef } from "@repo/contract";
import { dateTime } from "@/lib/format";
import { useLabContext } from "@/lib/lab/provider";
import { Button, ConfirmDialog, TextButton, useCommand } from "./ui";

export interface SiteDraft {
  ticked: boolean;
  name: string;
  password: string;
  changing: boolean;
}
export type InvitationDraft = Record<string, SiteDraft | undefined>;
export const draftOf = (draft: InvitationDraft, site: string): SiteDraft =>
  draft[site] ?? { ticked: true, name: "", password: "", changing: false };

export interface FormRow extends SiteRef {
  loginHeld: boolean;
  /** Set when the site is already in the Invitation. */
  grantedAt: string | null;
  neededBy: { name: string; retired: boolean }[];
}

/** Everything already invited, as it must be sent again: without logins, so the held ones are kept. */
export function keepAll(invitation: Invitation): InvitationSiteInput[] {
  return invitation.sites.map((s) => ({ site: s.site, kind: s.kind }));
}

function LoginFields({
  value,
  onChange,
}: {
  value: SiteDraft;
  onChange: (next: SiteDraft) => void;
}) {
  const id = useId();
  return (
    <div className="login-fields">
      <div className="field">
        <label htmlFor={`${id}-name`}>Name</label>
        <input
          id={`${id}-name`}
          autoComplete="off"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-password`}>Password</label>
        <input
          id={`${id}-password`}
          type="password"
          autoComplete="new-password"
          value={value.password}
          onChange={(e) => onChange({ ...value, password: e.target.value })}
        />
      </div>
    </div>
  );
}

function StandaloneControls({
  row,
  invitation,
}: {
  row: FormRow;
  invitation: Invitation;
}) {
  const { client, rereadAll } = useLabContext();
  const [value, setValue] = useState<SiteDraft>({
    ticked: true,
    name: "",
    password: "",
    changing: false,
  });
  const [withdrawing, setWithdrawing] = useState(false);
  const save = useCommand(
    () =>
      client!.putInvitation({
        sites: invitation.sites.map((s) =>
          s.site === row.site
            ? {
                site: s.site,
                kind: s.kind,
                login: { name: value.name, password: value.password },
              }
            : { site: s.site, kind: s.kind },
        ),
      }),
    // The login is dropped from the page the moment it is sent.
    () => {
      setValue({ ticked: true, name: "", password: "", changing: false });
      rereadAll();
    },
  );
  const holders = row.neededBy.filter((p) => !p.retired);
  const showFields = row.loginNeeded && (!row.loginHeld || value.changing);
  return (
    <div className="stack-sm">
      {!row.loginNeeded ? (
        <p className="ash">No login needed</p>
      ) : showFields ? (
        <>
          <LoginFields value={value} onChange={setValue} />
          <div className="cmd">
            <Button
              small
              onClick={() => void save.send()}
              disabled={save.pending || !value.name || !value.password}
            >
              {save.pending ? "Saving…" : "Save login"}
            </Button>
            {row.loginHeld ? (
              <TextButton
                onClick={() => setValue({ ...value, changing: false })}
              >
                Leave it
              </TextButton>
            ) : null}
            {save.fault ? (
              <span className="fault" role="alert">
                {save.fault}
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <p className="inline">
          Login held{" "}
          <TextButton onClick={() => setValue({ ...value, changing: true })}>
            Change
          </TextButton>
        </p>
      )}
      <p className="ash">Granted {dateTime(row.grantedAt)}</p>
      <div className="cmd">
        <Button
          variant="ghost"
          small
          disabled={holders.length > 0}
          onClick={() => setWithdrawing(true)}
        >
          Withdraw
        </Button>
        {holders.length ? (
          <span className="ash">
            Held by {holders.map((p) => p.name).join(", ")}. Retire them first.
          </span>
        ) : null}
      </div>
      <ConfirmDialog
        open={withdrawing}
        title={`Withdraw ${row.site}?`}
        confirmLabel="Withdraw"
        pendingLabel="Withdrawing…"
        run={async () => {
          await client!.putInvitation({
            sites: keepAll(invitation).filter((s) => s.site !== row.site),
          });
          rereadAll();
        }}
        onClose={() => setWithdrawing(false)}
      >
        Nothing will be able to reach it.
      </ConfirmDialog>
    </div>
  );
}

/**
 * The Invitation form: one component, used embedded in Review and invite
 * (nothing is saved until "Invite and start") and standalone on /invitation
 * (each change is saved as it is made). The only place the Invitation changes.
 */
export function InvitationForm(
  props:
    | {
        mode: "embedded";
        rows: FormRow[];
        draft: InvitationDraft;
        onDraft: (next: InvitationDraft) => void;
      }
    | { mode: "standalone"; rows: FormRow[]; invitation: Invitation },
) {
  return (
    <div style={{ borderBottom: "1px solid var(--hair)" }}>
      {props.rows.map((row) => {
        const value =
          props.mode === "embedded" ? draftOf(props.draft, row.site) : null;
        const set = (next: SiteDraft) => {
          if (props.mode === "embedded")
            props.onDraft({ ...props.draft, [row.site]: next });
        };
        const granted = row.grantedAt !== null;
        return (
          <div key={row.site} className="site-row">
            <div className="stack-sm" style={{ gap: "0.4rem" }}>
              {value ? (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={granted || value.ticked}
                    disabled={granted}
                    onChange={(e) =>
                      set({ ...value, ticked: e.target.checked })
                    }
                  />
                  <strong className="mono">{row.site}</strong>
                </label>
              ) : (
                <strong className="mono">{row.site}</strong>
              )}
              <span className="ash">
                {row.kind === "connector" ? "mailbox, read only" : "website"}
                {value && granted ? " · already invited" : ""}
              </span>
              {row.kind === "connector" ? (
                <span>It may read. It was never invited to send.</span>
              ) : null}
              {row.neededBy.length ? (
                <span className="ash">
                  Needed by {row.neededBy.map((p) => p.name).join(", ")}
                </span>
              ) : (
                <span className="ash">Needed by nothing at present</span>
              )}
            </div>
            {props.mode === "standalone" ? (
              <StandaloneControls row={row} invitation={props.invitation} />
            ) : !row.loginNeeded ? (
              <p className="ash">No login needed</p>
            ) : row.loginHeld && !value!.changing ? (
              <p className="inline">
                Login held{" "}
                <TextButton onClick={() => set({ ...value!, changing: true })}>
                  Change
                </TextButton>
              </p>
            ) : (
              <LoginFields value={value!} onChange={set} />
            )}
          </div>
        );
      })}
    </div>
  );
}
