import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  checkToolVersion,
  firstLine,
  readCurrentShelfVersion,
  readShelfVersion,
} from "../shelf/validator.ts";
import type { InvitationScope, ToolVersion } from "../shelf/types.ts";
import type {
  Chain,
  Item,
  ListItemsResult,
  PreparedStep,
  Refusal,
  ReplayResult,
  RunResult,
  RunnerOptions,
  RunScope,
  StepResult,
  WorkerTool,
} from "./types.ts";

const DEFAULT_STEP_TIMEOUT_MS = 60_000;
const DEFAULT_RUN_TIMEOUT_MS = 120_000;
const STEP_ID = /^[a-z][a-z0-9_]{0,63}$/;
const workerPath = fileURLToPath(new URL("./worker.mjs", import.meta.url));

interface WorkerRequest {
  operation: "list" | "run" | "replay";
  headless: boolean;
  stepTimeoutMs: number;
  source?: WorkerTool & { input: Record<string, unknown> };
  steps?: Array<WorkerTool & { id: string; input: Record<string, unknown> }>;
  tool?: WorkerTool;
  item?: Item;
  input?: Record<string, unknown>;
  check?: string;
  scope: RunScope;
}

interface WorkerResponse<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

export class Runner {
  private readonly options: Required<RunnerOptions>;

  constructor(options: RunnerOptions) {
    this.options = {
      shelfDir: path.resolve(options.shelfDir),
      headless: options.headless ?? process.env.LAB_HEADLESS === "1",
      stepTimeoutMs: options.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
      runTimeoutMs: options.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS,
    };
  }

  async installCheck(
    folder: string,
    invitation: InvitationScope,
    heldPasswords: readonly string[] = [],
    layout: "draft" | "installed" = "draft",
  ) {
    return checkToolVersion(folder, invitation, heldPasswords, layout);
  }

  async listItems(chain: Chain, scope: RunScope): Promise<ListItemsResult> {
    try {
      const steps = await this.prepareChain(chain, scope);
      const source = steps[0]!;
      return await this.runWorker<ListItemsResult>(
        {
          operation: "list",
          headless: this.options.headless,
          stepTimeoutMs: this.options.stepTimeoutMs,
          source: { ...asWorkerTool(source.toolVersion), input: source.input },
          scope,
        },
        this.options.runTimeoutMs,
        scope,
      );
    } catch (error) {
      if (error instanceof PrepareError) {
        return {
          status: error.status,
          tool: error.tool ?? chain.steps[0]?.tool ?? "",
          version: error.version ?? 0,
          durationMs: 0,
          items: [],
          error: `${error.stage}: ${error.message}`,
          logs: [],
          refusals: error.refusals,
          blockedBackgroundRequests: 0,
          modelCalls: 0,
        };
      }
      throw error;
    }
  }

  /** Executes the non-source part of a saved chain for one already-listed item. */
  async runItem(chain: Chain, item: Item, scope: RunScope): Promise<RunResult> {
    assertItem(item);
    try {
      const steps = await this.prepareChain(chain, scope);
      return await this.runWorker<RunResult>(
        {
          operation: "run",
          headless: this.options.headless,
          stepTimeoutMs: this.options.stepTimeoutMs,
          steps: steps.slice(1).map((step) => ({
            ...asWorkerTool(step.toolVersion),
            id: step.id,
            input: step.input,
          })),
          item,
          check: chain.check,
          scope,
        },
        this.options.runTimeoutMs,
        scope,
      );
    } catch (error) {
      if (error instanceof PrepareError) {
        const step = failedPrepareStep(error);
        return {
          status: error.status,
          steps: step ? [step] : [],
          proofValue: null,
          failedStep: step ? 1 : null,
          error: `${error.stage}: ${error.message}`,
          refusals: error.refusals,
          modelCalls: 0,
        };
      }
      throw error;
    }
  }

  async replayTool(
    name: string,
    version: number,
    input: Record<string, unknown>,
    scope: RunScope,
  ): Promise<ReplayResult> {
    try {
      const tool = await readShelfVersion(this.options.shelfDir, name, version);
      await this.assertRunnable(tool, scope);
      try {
        assertInputShape(input, tool, "replay");
      } catch (error) {
        throw new PrepareError(firstLine(error), {
          tool: tool.name,
          version: tool.version,
          stepId: "replay",
        });
      }
      return await this.runWorker<ReplayResult>(
        {
          operation: "replay",
          headless: this.options.headless,
          stepTimeoutMs: this.options.stepTimeoutMs,
          tool: asWorkerTool(tool),
          input,
          scope,
        },
        this.options.runTimeoutMs,
        scope,
      );
    } catch (error) {
      if (error instanceof PrepareError) {
        return {
          status: error.status,
          tool: name,
          version,
          durationMs: 0,
          result: null,
          error: `${error.stage}: ${error.message}`,
          logs: [],
          refusals: error.refusals,
          blockedBackgroundRequests: 0,
          modelCalls: 0,
        };
      }
      throw error;
    }
  }

  /**
   * A hand-written proof aid, deliberately outside the shelf. It exercises the
   * same browser guard used by saved chains without adding a team tool to the
   * product's shared library.
   */
  async runFixture({
    folder,
    targetUrl,
    allowedHost,
  }: {
    folder: string;
    targetUrl: string;
    allowedHost: string;
  }): Promise<ReplayResult> {
    const target = new URL(targetUrl);
    const site = allowedHost.toLowerCase();
    await access(path.join(folder, "tool.mjs"));
    const tool: WorkerTool = {
      name: "page_title_fixture",
      version: 0,
      codePath: path.join(folder, "tool.mjs"),
      meta: {
        name: "page_title_fixture",
        description: "Opens one invited page and returns its title.",
        sites: [site],
        connectors: [],
        effect: "reads",
        lists_items: false,
        input: { url: "The invited page to open." },
        output: { title: "The page title." },
      },
    };
    const scope: RunScope = {
      invitation: { sites: [site], connectors: [] },
      process: { sites: [site], connectors: [] },
    };
    // Keep URL parsing here so an invalid target never starts a browser.
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new Error("The fixture URL must use http or https.");
    }
    return this.runWorker<ReplayResult>(
      {
        operation: "replay",
        headless: this.options.headless,
        stepTimeoutMs: this.options.stepTimeoutMs,
        tool,
        input: { url: target.toString() },
        scope,
      },
      this.options.runTimeoutMs,
      scope,
    );
  }

  private async prepareChain(chain: Chain, scope: RunScope): Promise<PreparedStep[]> {
    if (!Array.isArray(chain.steps) || chain.steps.length === 0) {
      throw new Error("A chain needs a source tool as its first step.");
    }
    if (typeof chain.check !== "string" || !chain.check.startsWith("$")) {
      throw new Error("A chain check must be an item or earlier-step reference.");
    }

    const ids = new Set<string>();
    const prepared: PreparedStep[] = [];
    for (const [index, step] of chain.steps.entries()) {
      if (!STEP_ID.test(step.id) || ids.has(step.id)) {
        throw new Error("Every chain step needs a unique lower-case id.");
      }
      ids.add(step.id);
      let tool;
      try {
        tool = step.version
          ? await readShelfVersion(this.options.shelfDir, step.tool, step.version)
          : await readCurrentShelfVersion(this.options.shelfDir, step.tool);
      } catch (error) {
        throw new PrepareError(firstLine(error), { tool: step.tool, stepId: step.id });
      }
      await this.assertRunnable(tool, scope, step.id);
      try {
        assertInputShape(step.input, tool, step.id);
      } catch (error) {
        throw new PrepareError(firstLine(error), {
          tool: tool.name,
          version: tool.version,
          stepId: step.id,
        });
      }
      if (index === 0 && !tool.meta.lists_items) {
        throw new PrepareError("The first chain step must be a source tool.", {
          tool: tool.name,
          version: tool.version,
          stepId: step.id,
        });
      }
      if (index > 0 && tool.meta.lists_items) {
        throw new PrepareError("Only the first chain step may be a source tool.", {
          tool: tool.name,
          version: tool.version,
          stepId: step.id,
        });
      }
      prepared.push({ ...step, version: tool.version, toolVersion: tool });
    }
    return prepared;
  }

  private async assertRunnable(
    tool: ToolVersion,
    scope: RunScope,
    stepId?: string,
  ): Promise<void> {
    const heldPasswords = Object.values(scope.logins ?? {}).map(({ password }) => password);
    const check = await checkToolVersion(
      tool.folder,
      scope.invitation,
      heldPasswords,
      "installed",
    );
    if (!check.passed) {
      throw new PrepareError(check.issues.map((issue) => issue.message).join(" "), {
        tool: tool.name,
        version: tool.version,
        stepId,
      });
    }

    const processSites = new Set(scope.process.sites.map((site) => site.toLowerCase()));
    const processConnectors = new Set(scope.process.connectors);
    const outsideProcess = tool.meta.sites.find((site) => !processSites.has(site.toLowerCase()));
    if (outsideProcess) {
      throw new PrepareError(`The tool reaches a site outside this process: ${outsideProcess}.`, {
        status: "refused",
        tool: tool.name,
        version: tool.version,
        stepId,
        refusals: [
          {
            site: outsideProcess,
            url: `https://${outsideProcess}/`,
            tool: tool.name,
            version: tool.version,
            kind: "scope",
          },
        ],
      });
    }
    const outsideConnectors = tool.meta.connectors.find(
      (connector) => !processConnectors.has(connector),
    );
    if (outsideConnectors) {
      throw new PrepareError(
        `The tool reaches a connector outside this process: ${outsideConnectors}.`,
        {
          status: "refused",
          tool: tool.name,
          version: tool.version,
          stepId,
        },
      );
    }
  }

  private runWorker<T>(request: WorkerRequest, timeoutMs: number, scope: RunScope): Promise<T> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [workerPath], {
        stdio: ["pipe", "pipe", "pipe"],
        // Hand the browser a machine runtime, not the service's secrets.
        env: childEnv(),
      });
      let stdout = "";
      let stderr = "";
      let finished = false;
      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        child.kill("SIGKILL");
        reject(new Error(`The runner timed out after ${timeoutMs} ms.`));
      }, timeoutMs);
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        reject(new Error(redact(firstLine(error), scope)));
      });
      child.on("close", (code) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        try {
          const response = JSON.parse(stdout) as WorkerResponse<T>;
          if (!response.ok || response.value === undefined) {
            reject(new Error(redact(response.error || "The runner child did not return a result.", scope)));
            return;
          }
          if (code !== 0) {
            reject(new Error(redact(firstLine(stderr || "The runner child stopped."), scope)));
            return;
          }
          resolve(redactValue(response.value, scope));
        } catch {
          reject(
            new Error(
              redact(
                firstLine(stderr || "The runner child returned invalid data."),
                scope,
              ),
            ),
          );
        }
      });
      child.stdin.end(JSON.stringify(request));
    });
  }
}

/** PATH, HOME, temp dirs and Playwright's browser cache. Never DATABASE_URL or logins. */
function childEnv(): NodeJS.ProcessEnv {
  const names = [
    "PATH",
    "HOME",
    "USER",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "DISPLAY",
    "XDG_RUNTIME_DIR",
    "PLAYWRIGHT_BROWSERS_PATH",
  ] as const;
  const env: NodeJS.ProcessEnv = {};
  for (const name of names) {
    const value = process.env[name];
    if (value) env[name] = value;
  }
  return env;
}

class PrepareError extends Error {
  readonly stage = "install";
  readonly status: "failed" | "refused";
  readonly tool: string | null;
  readonly version: number | null;
  readonly stepId: string | null;
  readonly refusals: Refusal[];

  constructor(
    message: string,
    options: {
      status?: "failed" | "refused";
      tool?: string;
      version?: number;
      stepId?: string;
      refusals?: Refusal[];
    } = {},
  ) {
    super(message);
    this.name = "PrepareError";
    this.status = options.status ?? "failed";
    this.tool = options.tool ?? null;
    this.version = options.version ?? null;
    this.stepId = options.stepId ?? null;
    this.refusals = options.refusals ?? [];
  }
}

function failedPrepareStep(error: PrepareError): StepResult | null {
  if (!error.stepId) return null;
  return {
    id: error.stepId,
    tool: error.tool ?? "",
    version: error.version ?? 0,
    status: error.status,
    durationMs: 0,
    input: {},
    result: null,
    error: `${error.stage}: ${error.message}`,
    logs: [],
    refusals: error.refusals,
    blockedBackgroundRequests: 0,
  };
}

function asWorkerTool(tool: ToolVersion): WorkerTool {
  return {
    name: tool.name,
    version: tool.version,
    codePath: tool.codePath,
    meta: tool.meta,
  };
}

function assertInputShape(input: Record<string, unknown>, tool: ToolVersion, stepId: string): void {
  const expected = Object.keys(tool.meta.input).sort();
  const actual = Object.keys(input).sort();
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) {
    throw new Error(`Step ${stepId} does not match the input fields of ${tool.name}.`);
  }
}

function assertItem(item: Item): void {
  if (
    !item ||
    typeof item.id !== "string" ||
    item.id.length === 0 ||
    typeof item.label !== "string" ||
    item.label.length === 0 ||
    !item.data ||
    typeof item.data !== "object" ||
    Array.isArray(item.data)
  ) {
    throw new Error("A run item needs an id, label and data object.");
  }
}

function redact(text: string, scope: RunScope): string {
  let safe = text;
  for (const login of Object.values(scope.logins ?? {})) {
    if (login.password) safe = safe.split(login.password).join("[redacted]");
    if (login.username) safe = safe.split(login.username).join("[redacted]");
  }
  return safe;
}

function redactValue<T>(value: T, scope: RunScope): T {
  if (typeof value === "string") return redact(value, scope) as T;
  if (Array.isArray(value)) return value.map((entry) => redactValue(entry, scope)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, redactValue(entry, scope)]),
    ) as T;
  }
  return value;
}
