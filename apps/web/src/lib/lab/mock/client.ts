import type { LabEvent } from "@repo/contract";
import {
  LabError,
  UNREACHABLE,
  type ConnectionState,
  type LabClient,
  type MockScenario,
} from "../client";
import { Engine, STORE_KEY } from "./engine";

const SCENARIO_KEY = "lab-mock-scenario";
const SCENARIOS: MockScenario[] = ["empty", "story", "full"];
const DEFAULT_SCENARIO: MockScenario = "story";

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Without storage the choice lasts for this page only.
  }
}

/** `?mock=empty|story|full` picks the starting scenario; the tab remembers it. */
function pickScenario(): MockScenario {
  const asked = new URLSearchParams(window.location.search).get("mock");
  if (asked && (SCENARIOS as string[]).includes(asked)) {
    write(SCENARIO_KEY, asked);
    return asked as MockScenario;
  }
  const kept = read(SCENARIO_KEY);
  return kept && (SCENARIOS as string[]).includes(kept)
    ? (kept as MockScenario)
    : DEFAULT_SCENARIO;
}

/** The in-browser simulation of the lab service. Browser only. */
export function createMockClient(): LabClient {
  let scenario = pickScenario();
  let engine = new Engine(scenario, read(STORE_KEY));
  engine.save();
  let cut = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const states = new Set<(state: ConnectionState) => void>();
  const events = new Set<(event: LabEvent) => void>();
  let unlisten = engine.listen((event) => events.forEach((fn) => fn(event)));

  const ensureTimer = () => {
    if (timer) return;
    timer = setInterval(() => {
      if (!cut) engine.poll();
    }, 250);
  };

  /** Every call waits a moment, as a real request would, and copies what it returns. */
  async function call<T>(work: () => T, command = false): Promise<T> {
    await new Promise((resolve) => setTimeout(resolve, command ? 320 : 110));
    if (cut) throw new LabError(UNREACHABLE, "unreachable");
    const result = work();
    if (command) engine.save();
    return result === undefined ? result : (structuredClone(result) as T);
  }

  return {
    mode: "mock",
    mock: {
      get scenario() {
        return scenario;
      },
      restart(next) {
        scenario = next;
        write(SCENARIO_KEY, next);
        unlisten();
        engine = new Engine(next, null);
        engine.save();
        unlisten = engine.listen((event) => events.forEach((fn) => fn(event)));
      },
      setLineCut(next) {
        cut = next;
        states.forEach((fn) => fn(next ? "dropped" : "live"));
      },
      isLineCut: () => cut,
    },

    health: () =>
      call(() => ({ service: "ok" as const, database: "ok" as const })),

    saveInterview: (body) => call(() => engine.saveInterview(body), true),
    listInterviews: () => call(() => engine.listInterviews()),
    getInterview: (id) => call(() => engine.getInterview(id)),
    startInterview: (id) => call(() => engine.startInterview(id), true),

    getInvitation: () => call(() => engine.getInvitation()),
    putInvitation: (body) => call(() => engine.putInvitation(body), true),

    listProcesses: () => call(() => engine.listProcesses()),
    getProcess: (id) => call(() => engine.detail(id)),
    removeProcess: (id) => call(() => engine.removeProcess(id), true),
    learn: (id) => call(() => engine.learn(id), true),
    seal: (id) => call(() => engine.seal(id), true),
    runNow: (id) => call(() => engine.runNow(id), true),
    resume: (id) => call(() => engine.resume(id), true),
    retire: (id) => call(() => engine.retire(id), true),
    setSchedule: (id, schedule) =>
      call(() => engine.setSchedule(id, schedule), true),

    listTools: () => call(() => engine.listTools()),
    getTool: (name) => call(() => engine.getTool(name)),

    listRuns: (q) => call(() => engine.listRuns(q?.processId, q?.limit)),
    listMonsterRuns: (q) => call(() => engine.listMonsterRuns(q?.processId)),

    subscribe(onEvent, onState) {
      events.add(onEvent);
      states.add(onState);
      ensureTimer();
      onState("connecting");
      const opening = setTimeout(
        () => onState(cut ? "unreachable" : "live"),
        150,
      );
      return () => {
        clearTimeout(opening);
        events.delete(onEvent);
        states.delete(onState);
        if (!events.size && timer) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
  };
}
