"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { LabEvent } from "@repo/contract";
import {
  getLabClient,
  LabError,
  type ConnectionState,
  type LabClient,
} from ".";

/** "restored" is shown for three seconds after the line comes back. */
export type Connection = ConnectionState | "restored";

interface LabContextValue {
  /** Null on the server and until the page has woken in the browser. */
  client: LabClient | null;
  connection: Connection;
  /** Rises when everything on screen should be read again. */
  epoch: number;
  /** True for a few seconds after a command found the state had changed. */
  changed: boolean;
  noteChanged(): void;
  rereadAll(): void;
  listen(listener: (event: LabEvent) => void): () => void;
}

const LabContext = createContext<LabContextValue | null>(null);

const noSubscription = () => () => {};

export function LabProvider({ children }: { children: React.ReactNode }) {
  const client = useSyncExternalStore(noSubscription, getLabClient, () => null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [epoch, setEpoch] = useState(0);
  const [changed, setChanged] = useState(false);
  const listeners = useRef(new Set<(event: LabEvent) => void>());

  useEffect(() => {
    if (!client) return;
    let wasDown = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = client.subscribe(
      (event) => listeners.current.forEach((listener) => listener(event)),
      (state) => {
        clearTimeout(timer);
        if (state === "live") {
          if (wasDown) {
            // Back again: read everything on screen once more, then say so briefly.
            setEpoch((n) => n + 1);
            setConnection("restored");
            timer = setTimeout(() => setConnection("live"), 3000);
          } else {
            setConnection("live");
          }
          wasDown = false;
        } else {
          if (state !== "connecting") wasDown = true;
          setConnection(state);
        }
      },
    );
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [client]);

  const listen = useCallback((listener: (event: LabEvent) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const rereadAll = useCallback(() => setEpoch((n) => n + 1), []);
  const noteChanged = useCallback(() => {
    setEpoch((n) => n + 1);
    setChanged(true);
    setTimeout(() => setChanged(false), 6000);
  }, []);

  const value = useMemo(
    () => ({
      client,
      connection,
      epoch,
      changed,
      noteChanged,
      rereadAll,
      listen,
    }),
    [client, connection, epoch, changed, noteChanged, rereadAll, listen],
  );
  return <LabContext.Provider value={value}>{children}</LabContext.Provider>;
}

export function useLabContext(): LabContextValue {
  const value = useContext(LabContext);
  if (!value) throw new Error("useLabContext needs a LabProvider above it.");
  return value;
}

/** True while live updates are flowing; pulses and countdowns stop otherwise. */
export function useIsLive(): boolean {
  const { connection } = useLabContext();
  return (
    connection === "live" ||
    connection === "restored" ||
    connection === "connecting"
  );
}

export function useLabEvents(handler: (event: LabEvent) => void) {
  const { listen } = useLabContext();
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => listen((event) => ref.current(event)), [listen]);
}

const APPEND_ONLY: LabEvent["kind"][] = [
  "monster.action",
  "monster.tokens",
  "monster.verification",
];

export interface LabRead<T> {
  data: T | undefined;
  /** Set when the read failed and nothing is on screen yet. */
  error: LabError | null;
  loading: boolean;
  notFound: boolean;
  reload(): void;
}

interface ReadState<T> {
  key: string;
  data?: T;
  error: LabError | null;
}

/**
 * Reads from the lab service and keeps the answer fresh: it reads again when
 * a live event says something changed, and after the connection returns.
 * `apply` may fold an event into what is already held, to avoid a read.
 */
export function useLab<T>(
  key: string,
  load: (client: LabClient) => Promise<T>,
  options?: {
    apply?: (data: T, event: LabEvent) => T | null;
    refreshOn?: (event: LabEvent) => boolean;
  },
): LabRead<T> {
  const { client, epoch } = useLabContext();
  const [state, setState] = useState<ReadState<T>>({ key, error: null });
  const loadRef = useRef(load);
  const optionsRef = useRef(options);
  const keyRef = useRef(key);
  useEffect(() => {
    loadRef.current = load;
    optionsRef.current = options;
    keyRef.current = key;
  });

  const read = useCallback(() => {
    if (!client) return;
    const asked = keyRef.current;
    loadRef.current(client).then(
      (data) => {
        if (keyRef.current === asked)
          setState({ key: asked, data, error: null });
      },
      (error: unknown) => {
        if (keyRef.current !== asked) return;
        const problem =
          error instanceof LabError ? error : new LabError(String(error));
        // Keep what is on screen; a failed refresh must not clear it.
        setState((held) =>
          held.key === asked &&
          held.data !== undefined &&
          problem.code !== "not_found"
            ? held
            : { key: asked, error: problem },
        );
      },
    );
  }, [client]);

  useEffect(() => {
    keyRef.current = key;
    read();
  }, [read, key, epoch]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const heldRef = useRef(state);
  useEffect(() => {
    heldRef.current = state;
  }, [state]);
  useLabEvents((event) => {
    const apply = optionsRef.current?.apply;
    const held = heldRef.current;
    if (apply && held.key === keyRef.current && held.data !== undefined) {
      const next = apply(held.data, event);
      if (next !== null) {
        // Several events can arrive before the next render; keep folding into the newest.
        heldRef.current = { ...held, data: next };
        setState(heldRef.current);
        return;
      }
    }
    const wanted =
      optionsRef.current?.refreshOn ??
      ((e: LabEvent) => !APPEND_ONLY.includes(e.kind));
    if (!wanted(event)) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(read, 90);
  });

  const current =
    state.key === key ? state : { key, error: null, data: undefined };
  return {
    data: current.data,
    error: current.data === undefined ? current.error : null,
    loading: current.data === undefined && !current.error,
    notFound: current.error?.code === "not_found",
    reload: read,
  };
}

// ───────────── a clock that ticks once a second ─────────────

let nowValue = 0;
let nowTimer: ReturnType<typeof setInterval> | null = null;
const nowListeners = new Set<() => void>();
function subscribeNow(listener: () => void) {
  nowListeners.add(listener);
  if (!nowTimer) {
    nowValue = Date.now();
    nowTimer = setInterval(() => {
      nowValue = Date.now();
      nowListeners.forEach((fn) => fn());
    }, 1000);
  }
  return () => {
    nowListeners.delete(listener);
    if (!nowListeners.size && nowTimer) {
      clearInterval(nowTimer);
      nowTimer = null;
    }
  };
}

/** The time now, in milliseconds, refreshed each second. 0 before the page wakes. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribeNow,
    () => nowValue,
    () => 0,
  );
}

// ───────────── small browser stores ─────────────

const SEEN_KEY = "refusals-seen-at";
const seenListeners = new Set<() => void>();
function readSeen(): number {
  try {
    return Number(window.localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}
/** The time of the newest refusal the user has looked at. Kept in the browser. */
export function useRefusalsSeenAt(): [number, (at: number) => void] {
  const value = useSyncExternalStore(
    (listener) => {
      seenListeners.add(listener);
      return () => seenListeners.delete(listener);
    },
    readSeen,
    () => 0,
  );
  const set = useCallback((at: number) => {
    try {
      window.localStorage.setItem(SEEN_KEY, String(at));
    } catch {
      // Without storage the mark lasts for this page only.
    }
    seenListeners.forEach((fn) => fn());
  }, []);
  return [value, set];
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", listener);
      return () => query.removeEventListener("change", listener);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
