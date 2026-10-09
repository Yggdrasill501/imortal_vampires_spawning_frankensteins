"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { TranscriptTurn } from "@repo/contract";
import { Bats } from "@/components/bats";
import { RuneRing, Runes } from "@/components/runes";
import { Button, Diamond, SectionHead, useCommand } from "@/components/ui";
import { useLab, useLabContext } from "@/lib/lab/provider";
import { createTabStore } from "@/lib/store";
import { getVoice, MicrophoneRefused, type VoiceSession } from "@/lib/voice";
import { TranscriptView } from "./review";

interface DraftState {
  turns: TranscriptTurn[];
  startedAt: string | null;
  /** The interview this one continues, once its transcript has been loaded. */
  from: string | null;
  /** The saved interview being read, if any. */
  readingId: string | null;
}
const EMPTY: DraftState = {
  turns: [],
  startedAt: null,
  from: null,
  readingId: null,
};
const useDraft = createTabStore<DraftState>("interview-draft", EMPTY);

type VoiceState = "ready" | "connecting" | "conversation" | "refused" | "lost";

export function InterviewScreen() {
  const { client } = useLabContext();
  const router = useRouter();
  const from = useSearchParams().get("from");
  const voice = getVoice();
  const [draft, setDraft] = useDraft();
  const [state, setState] = useState<VoiceState>("ready");
  const [mode, setMode] = useState<"listening" | "speaking">("listening");
  const [line, setLine] = useState("");
  const session = useRef<VoiceSession | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);

  const addTurn = (turn: TranscriptTurn) =>
    setDraft((held) => ({
      ...held,
      turns: [...held.turns, turn],
      startedAt: held.startedAt ?? new Date().toISOString(),
    }));

  // Continuing an earlier interview: load its transcript once.
  const earlier = useLab(
    `interview-from:${from ?? ""}`,
    async (c) => (from ? c.getInterview(from) : null),
    {
      refreshOn: () => false,
    },
  );
  useEffect(() => {
    if (from && earlier.data && draft.from !== from && !draft.readingId) {
      setDraft({
        turns: earlier.data.transcript,
        startedAt: earlier.data.startedAt,
        from,
        readingId: null,
      });
    }
  }, [from, earlier.data, draft.from, draft.readingId, setDraft]);

  // While a saved interview is being read, watch it; move on when the reading is done.
  const reading = useLab(
    `interview-reading:${draft.readingId ?? ""}`,
    async (c) => (draft.readingId ? c.getInterview(draft.readingId) : null),
    { refreshOn: (e) => e.kind === "interview.status" },
  );
  const read = reading.data;
  useEffect(() => {
    if (read && read.id === draft.readingId && read.status !== "being_read") {
      setDraft(EMPTY);
      router.push(`/interviews/${encodeURIComponent(read.id)}`);
    }
  }, [read, draft.readingId, router, setDraft]);

  useEffect(
    () => () => {
      void session.current?.end();
    },
    [],
  );

  const begin = async () => {
    setState("connecting");
    try {
      session.current = await voice.connect({
        onTurn: addTurn,
        onMode: setMode,
        onLost: () => {
          session.current = null;
          setState("lost");
        },
      });
      setState("conversation");
    } catch (error) {
      session.current = null;
      setState(error instanceof MicrophoneRefused ? "refused" : "lost");
      box.current?.focus();
    }
  };

  const cancel = () => {
    void session.current?.end();
    session.current = null;
    setState("ready");
  };

  const sendLine = () => {
    const text = line.trim();
    if (!text) return;
    setLine("");
    // Connected: the typed line also goes into the same conversation, so the agent can answer it.
    if (session.current) session.current.sendText(text);
    addTurn({ speaker: "user", text });
  };

  const end = useCommand(async () => {
    const pendingLine = line.trim();
    const turns = pendingLine
      ? [...draft.turns, { speaker: "user" as const, text: pendingLine }]
      : draft.turns;
    await session.current?.end();
    session.current = null;
    setState("ready");
    const saved = await client!.saveInterview({
      transcript: turns,
      language: (navigator.language || "en").split("-")[0],
      startedAt: draft.startedAt ?? new Date().toISOString(),
      endedAt: new Date().toISOString(),
      continuedFrom: draft.from ?? undefined,
    });
    setLine("");
    setDraft({ ...draft, turns, readingId: saved.id });
  });

  const isReading = Boolean(draft.readingId) && !read?.readError;
  const couldNotRead = Boolean(draft.readingId) && Boolean(read?.readError);
  const locked = isReading || end.pending;
  const userSpoke =
    draft.turns.some((t) => t.speaker === "user") || line.trim().length > 0;

  const discLabel =
    state === "connecting"
      ? "Calling…"
      : state === "conversation"
        ? mode === "speaking"
          ? "Speaking"
          : "Listening"
        : state === "lost"
          ? "Call again"
          : "Begin";

  // The eye is shut when there is no voice to give: not set up, refused, or the interview is being read.
  const shut =
    !voice.configured || state === "refused" || (locked && state === "ready");

  return (
    <section className="band hazed with-bats">
      <Bats />
      <div className="wrap">
        <SectionHead label="The interview" title="Tell it how your night goes.">
          Say what you do, step by step, in your own language. It will ask how
          long each task takes and how often.
        </SectionHead>

        <div className="book-stage">
          <Runes />
          <div className="book">
            <span className="ribbon" aria-hidden="true" />
            <div className="page left">
              <p className="label page-title">Speak</p>
              <div className="eclipse-stage">
                <div className="eye-socket">
                  <RuneRing />
                  <button
                    type="button"
                    className={`eclipse eye ${state === "connecting" ? "turning" : ""} ${state === "conversation" ? "awake" : ""} ${state === "conversation" && mode === "speaking" ? "wide" : ""} ${shut ? "shut" : ""}`}
                    disabled={
                      !voice.configured ||
                      locked ||
                      state === "connecting" ||
                      state === "conversation" ||
                      state === "refused"
                    }
                    onClick={() => void begin()}
                    aria-label={
                      state === "lost"
                        ? "Call again"
                        : "Begin the voice interview"
                    }
                  >
                    <span className="eye-iris" />
                    <span className="eye-pupil" />
                    <span className="eye-glint" />
                    <span className="eye-lid" />
                  </button>
                </div>
                <p className="label eye-label">{discLabel}</p>
                <p
                  className="ash"
                  role="status"
                  style={{ textAlign: "center" }}
                >
                  {!voice.configured
                    ? "Voice is not configured on this machine. Write it below instead."
                    : state === "ready"
                      ? "Your browser will ask for the microphone."
                      : state === "connecting"
                        ? "Calling the house…"
                        : state === "conversation"
                          ? mode === "speaking"
                            ? "Speaking"
                            : "Listening"
                          : state === "refused"
                            ? "The microphone is closed to us. Write it instead."
                            : ""}
                </p>
                {state === "connecting" ? (
                  <Button variant="ghost" small onClick={cancel}>
                    Cancel
                  </Button>
                ) : null}
              </div>

              {state === "lost" ? (
                <div
                  className="bar"
                  role="alert"
                  style={{ border: "1px solid var(--ember)" }}
                >
                  <div className="wrap">
                    The voice is gone. Your words are kept. Go on in writing.
                  </div>
                </div>
              ) : null}
              <span className="folio" aria-hidden="true">
                i
              </span>
            </div>
            <div className="page right">
              <p className="label page-title">Or write</p>
              <section className="stack-sm page-words" aria-label="Transcript">
                <h2 className="sr-only">Transcript</h2>
                {draft.turns.length ? (
                  <TranscriptView
                    interview={{
                      transcript: draft.turns,
                      language:
                        read?.language ?? earlier.data?.language ?? "und",
                    }}
                  />
                ) : (
                  <p className="ash">Nothing has been said yet.</p>
                )}
              </section>

              {isReading ? (
                <p className="inline" role="status">
                  <Diamond pulse className="ember" />
                  The transcript is being read. This takes a minute or two.
                </p>
              ) : null}
              {couldNotRead ? (
                <div className="stack-sm" role="alert">
                  <p>The lab could not read it. Nothing is lost.</p>
                  <p className="ash">{read?.readError}</p>
                </div>
              ) : null}

              <form
                className="stack-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendLine();
                }}
              >
                <div className="field">
                  <label htmlFor="interview-line">Your next line</label>
                  <textarea
                    id="interview-line"
                    ref={box}
                    value={line}
                    disabled={locked}
                    placeholder="Each night I open the mailbox and look for…"
                    onChange={(e) => setLine(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        sendLine();
                      }
                    }}
                  />
                </div>
                <div className="cmd">
                  <Button
                    type="submit"
                    variant="ghost"
                    disabled={locked || !line.trim()}
                  >
                    Add to the transcript
                  </Button>
                  <Button
                    onClick={() => void end.send()}
                    disabled={locked || !userSpoke}
                  >
                    {end.pending || isReading
                      ? "Reading…"
                      : couldNotRead
                        ? "Read it again"
                        : "End the interview"}
                  </Button>
                  {draft.turns.length && !locked ? (
                    <button
                      type="button"
                      className="btn-text"
                      onClick={() => setDraft(EMPTY)}
                    >
                      Start over
                    </button>
                  ) : null}
                  {end.fault ? (
                    <span className="fault" role="alert">
                      {end.fault}
                    </span>
                  ) : null}
                </div>
              </form>
              <span className="folio" aria-hidden="true">
                ii
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
