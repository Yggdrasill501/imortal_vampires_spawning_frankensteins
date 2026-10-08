import {
  DEFAULT_LAB_URL,
  PATHS,
  type ApiError,
  type HealthResponse,
  type Interview,
  type Invitation,
  type LabEvent,
  type ListMonsterRunsResponse,
  type ListProcessesResponse,
  type ListRunsResponse,
  type ListToolsResponse,
  type ProcessDetail,
  type StartInterviewResponse,
  type Tool,
} from "@repo/contract";
import {
  LabError,
  UNREACHABLE,
  type ConnectionState,
  type LabClient,
} from "./client";

const RETRY_MS = [1000, 2000, 5000];

function query(params?: object): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function createHttpClient(
  baseUrl: string = process.env.NEXT_PUBLIC_LAB_URL || DEFAULT_LAB_URL,
): LabClient {
  const base = baseUrl.replace(/\/+$/, "");

  async function call<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(base + path, {
        method,
        headers:
          body === undefined
            ? undefined
            : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
    } catch {
      throw new LabError(UNREACHABLE, "unreachable");
    }
    if (!response.ok) {
      let problem: Partial<ApiError> = {};
      try {
        problem = (await response.json()) as Partial<ApiError>;
      } catch {
        // The body was not JSON; fall through to the generic sentence.
      }
      throw new LabError(
        problem.error || "The lab refused, and did not say why.",
        problem.code ??
          (response.status === 404
            ? "not_found"
            : response.status === 409
              ? "state_changed"
              : "internal"),
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  const get = <T>(path: string) => call<T>("GET", path);
  const post = <T>(path: string, body?: unknown) => call<T>("POST", path, body);

  return {
    mode: "http",
    health: () => get<HealthResponse>(PATHS.health),

    saveInterview: (body) => post<Interview>(PATHS.interviews, body),
    getInterview: (id) => get<Interview>(PATHS.interview(id)),
    startInterview: async (id) =>
      (await post<StartInterviewResponse>(PATHS.interviewStart(id))).interview,

    getInvitation: () => get<Invitation>(PATHS.invitation),
    putInvitation: (body) => call<Invitation>("PUT", PATHS.invitation, body),

    listProcesses: async () =>
      (await get<ListProcessesResponse>(PATHS.processes)).processes,
    getProcess: (id) => get<ProcessDetail>(PATHS.process(id)),
    removeProcess: async (id) => {
      await call<unknown>("DELETE", PATHS.process(id));
    },
    learn: (id) => post<ProcessDetail>(PATHS.processLearn(id)),
    seal: (id) => post<ProcessDetail>(PATHS.processSeal(id)),
    runNow: (id) => post<ProcessDetail>(PATHS.processRun(id)),
    resume: (id) => post<ProcessDetail>(PATHS.processResume(id)),
    retire: (id) => post<ProcessDetail>(PATHS.processRetire(id)),
    setSchedule: (id, schedule) =>
      call<ProcessDetail>("PUT", PATHS.processSchedule(id), { schedule }),

    listTools: async () => (await get<ListToolsResponse>(PATHS.tools)).tools,
    getTool: (name) => get<Tool>(PATHS.tool(name)),

    listRuns: async (q) =>
      (await get<ListRunsResponse>(PATHS.runs + query(q))).runs,
    listMonsterRuns: async (q) =>
      (await get<ListMonsterRunsResponse>(PATHS.monsterRuns + query(q)))
        .monsterRuns,

    subscribe(onEvent, onState) {
      let source: EventSource | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let attempt = 0;
      let everLive = false;
      let closed = false;

      const open = () => {
        if (closed) return;
        source = new EventSource(base + PATHS.events);
        source.onopen = () => {
          attempt = 0;
          everLive = true;
          onState("live");
        };
        source.onmessage = (message) => {
          try {
            onEvent(JSON.parse(message.data as string) as LabEvent);
          } catch {
            // A line that is not an event is ignored.
          }
        };
        source.onerror = () => {
          // EventSource retries by itself at its own pace; the spec sets ours.
          source?.close();
          source = null;
          if (closed) return;
          onState(everLive ? "dropped" : ("unreachable" as ConnectionState));
          const wait = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]!;
          attempt += 1;
          timer = setTimeout(open, wait);
        };
      };

      onState("connecting");
      open();
      return () => {
        closed = true;
        if (timer) clearTimeout(timer);
        source?.close();
      };
    },
  };
}
