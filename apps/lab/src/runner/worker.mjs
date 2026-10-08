import { pathToFileURL } from "node:url";

async function readRequest() {
  let body = "";
  for await (const chunk of process.stdin) body += chunk;
  return JSON.parse(body);
}

async function run(request) {
  if (request.operation === "list") return listItems(request);
  if (request.operation === "run") return runItem(request);
  if (request.operation === "replay") return replay(request);
  throw new Error("The runner operation is unknown.");
}

async function listItems(request) {
  const result = await withRuntime(request, async (runtime) => {
    const step = await executeTool(runtime, request.source, request.source.input, "source");
    if (step.status !== "passed") return step;
    try {
      const items = readItems(step.result);
      return { ...step, items };
    } catch (error) {
      return {
        ...step,
        status: "failed",
        result: null,
        error: `tool: ${firstLine(error)}`,
        items: [],
      };
    }
  });
  return {
    status: result.status,
    tool: request.source.name,
    version: request.source.version,
    durationMs: result.durationMs,
    items: result.status === "passed" ? result.items : [],
    error: result.error,
    logs: result.logs,
    refusals: result.refusals,
    blockedBackgroundRequests: result.blockedBackgroundRequests,
    modelCalls: 0,
  };
}

async function runItem(request) {
  const allRefusals = [];
  const results = {};
  const steps = [];
  return withRuntime(request, async (runtime) => {
    for (let position = 0; position < request.steps.length; position += 1) {
      const definition = request.steps[position];
      let input;
      try {
        input = resolveValue(definition.input, request.item, results);
      } catch (error) {
        const failed = failedStep(definition, {}, "resolve", error);
        steps.push(failed);
        return failedRun("failed", steps, null, position + 1, failed.error, allRefusals);
      }
      const step = await executeTool(runtime, definition, input, definition.id);
      steps.push(step);
      allRefusals.push(...step.refusals);
      if (step.status !== "passed") {
        return failedRun(
          step.status,
          steps,
          null,
          position + 1,
          step.error,
          allRefusals,
        );
      }
      results[definition.id] = step.result;
    }
    let proof;
    try {
      proof = resolveOne(request.check, request.item, results);
    } catch (error) {
      return failedRun("failed", steps, null, null, `check: ${firstLine(error)}`, allRefusals);
    }
    if (!isPresent(proof)) {
      return failedRun("failed", steps, null, null, "check: The proof value was empty.", allRefusals);
    }
    return {
      status: "passed",
      steps,
      proofValue: printable(proof),
      failedStep: null,
      error: null,
      refusals: allRefusals,
      modelCalls: 0,
    };
  });
}

async function replay(request) {
  return withRuntime(request, async (runtime) => {
    const step = await executeTool(runtime, request.tool, request.input, "replay");
    return {
      status: step.status,
      tool: request.tool.name,
      version: request.tool.version,
      durationMs: step.durationMs,
      result: step.result,
      error: step.error,
      logs: step.logs,
      refusals: step.refusals,
      blockedBackgroundRequests: step.blockedBackgroundRequests,
      modelCalls: 0,
    };
  });
}

async function withRuntime(request, work) {
  const runtime = new ToolRuntime(request);
  try {
    return await work(runtime);
  } finally {
    await runtime.close();
  }
}

class ToolRuntime {
  constructor(request) {
    this.request = request;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.active = null;
  }

  async pageFor(tool) {
    if (!tool.meta.sites.length) return undefined;
    if (!this.page) {
      const { chromium } = await import("playwright");
      this.browser = await chromium.launch({ headless: this.request.headless });
      this.context = await this.browser.newContext();
      await this.context.route("**/*", async (route) => {
        const target = route.request().url();
        const allowed = this.active?.sites ?? new Set();
        const parsed = safeUrl(target);
        const host = parsed?.hostname?.toLowerCase() ?? target;
        const isHttp = parsed?.protocol === "http:" || parsed?.protocol === "https:";
        if (isHttp && allowed.has(host)) {
          await route.continue();
          return;
        }
        if (!isHttp && target === "about:blank") {
          await route.continue();
          return;
        }
        const navigation = route.request().isNavigationRequest();
        if (navigation && this.active) {
          this.active.refusals.push({
            site: host,
            url: target,
            tool: this.active.tool.name,
            version: this.active.tool.version,
            kind: "navigation",
          });
        } else if (this.active) {
          this.active.blockedBackgroundRequests += 1;
        }
        await route.abort("blockedbyclient");
      });
      this.page = await this.context.newPage();
    }
    return this.page;
  }

  async close() {
    await this.browser?.close();
  }
}

async function executeTool(runtime, tool, input, stepId) {
  const startedAt = Date.now();
  const state = {
    tool,
    sites: new Set(tool.meta.sites.map((site) => site.toLowerCase())),
    refusals: [],
    blockedBackgroundRequests: 0,
  };
  runtime.active = state;
  const logs = [];
  try {
    const moduleUrl = `${pathToFileURL(tool.codePath).href}?run=${encodeURIComponent(`${Date.now()}-${Math.random()}`)}`;
    const loaded = await import(moduleUrl);
    if (typeof loaded.default !== "function") {
      throw new Error("The tool default export is not a function.");
    }
    const page = await runtime.pageFor(tool);
    const heldLogins = runtime.request.scope.logins ?? {};
    const logins = Object.fromEntries(
      tool.meta.sites.flatMap((site) => {
        const match = Object.entries(heldLogins).find(
          ([key]) => key.toLowerCase() === site.toLowerCase(),
        );
        return match ? [[site, match[1]]] : [];
      }),
    );
    const connectors = Object.fromEntries(
      tool.meta.connectors.map((connector) => [
        connector,
        {
          call: async () => {
            throw new Error(`The ${connector} connector is not configured in this runner slice.`);
          },
        },
      ]),
    );
    const result = await withTimeout(
      loaded.default({
        ...(page ? { page } : {}),
        input: structuredClone(input),
        log: (line) => {
          if (
            typeof line !== "string" ||
            line.includes("\n") ||
            !line.trim().endsWith(".")
          ) {
            throw new Error("A tool log must be one sentence ending with a full stop.");
          }
          logs.push(line);
        },
        logins,
        connectors,
      }),
      runtime.request.stepTimeoutMs,
    );
    if (!isPlainObject(result)) {
      throw new Error("The tool must return one plain object.");
    }
    assertOutputShape(result, tool);
    if (state.refusals.some((refusal) => refusal.kind === "navigation")) {
      return toolResult("refused", tool, input, null, "run: The browser refused an uninvited page.", logs, state, startedAt);
    }
    return toolResult("passed", tool, input, result, null, logs, state, startedAt);
  } catch (error) {
    const refused = state.refusals.some((refusal) => refusal.kind === "navigation");
    return toolResult(
      refused ? "refused" : "failed",
      tool,
      input,
      null,
      `${refused ? "run" : "tool"}: ${firstLine(error)}`,
      logs,
      state,
      startedAt,
    );
  } finally {
    runtime.active = null;
  }
}

function toolResult(status, tool, input, result, error, logs, state, startedAt) {
  return {
    id: tool.id ?? undefined,
    tool: tool.name,
    version: tool.version,
    status,
    durationMs: Date.now() - startedAt,
    input,
    result,
    error,
    logs,
    refusals: state.refusals,
    blockedBackgroundRequests: state.blockedBackgroundRequests,
  };
}

function failedStep(definition, input, stage, error) {
  return {
    id: definition.id,
    tool: definition.name,
    version: definition.version,
    status: "failed",
    durationMs: 0,
    input,
    result: null,
    error: `${stage}: ${firstLine(error)}`,
    logs: [],
    refusals: [],
    blockedBackgroundRequests: 0,
  };
}

function failedRun(status, steps, proofValue, failedStep, error, refusals) {
  return {
    status,
    steps,
    proofValue,
    failedStep,
    error,
    refusals,
    modelCalls: 0,
  };
}

function readItems(result) {
  if (!Array.isArray(result.items)) throw new Error("A source tool must return an items array.");
  const seen = new Set();
  return result.items.map((item) => {
    if (!isPlainObject(item) || typeof item.id !== "string" || !item.id || typeof item.label !== "string" || !item.label || !isPlainObject(item.data)) {
      throw new Error("Every source item needs an id, label and data object.");
    }
    if (seen.has(item.id)) throw new Error("A source tool returned the same item id twice.");
    seen.add(item.id);
    return item;
  });
}

function assertOutputShape(result, tool) {
  const expected = Object.keys(tool.meta.output).sort();
  const actual = Object.keys(result).sort();
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) {
    throw new Error(`The tool result does not match the output fields of ${tool.name}.`);
  }
}

function resolveValue(value, item, results) {
  if (typeof value === "string") return value.startsWith("$") ? resolveOne(value, item, results) : value;
  if (Array.isArray(value)) return value.map((entry) => resolveValue(entry, item, results));
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, resolveValue(entry, item, results)]));
  return value;
}

function resolveOne(reference, item, results) {
  const itemMatch = /^\$item\.([a-zA-Z_][\w-]*)$/.exec(reference);
  if (itemMatch) return readField(item.data, itemMatch[1], reference);
  const stepMatch = /^\$steps\.([a-z][a-z0-9_]*)\.([a-zA-Z_][\w-]*)$/.exec(reference);
  if (stepMatch) return readField(results[stepMatch[1]], stepMatch[2], reference);
  throw new Error(`The reference ${reference} is not valid or is not available yet.`);
}

function readField(record, field, reference) {
  if (!isPlainObject(record) || !(field in record)) {
    throw new Error(`The reference ${reference} did not resolve.`);
  }
  return record[field];
}

function isPresent(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function printable(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function firstLine(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(/\r?\n/, 1)[0] || "The tool failed without an error message.";
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`The tool timed out after ${timeoutMs} ms.`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const request = await readRequest();

try {
  const value = await run(request);
  process.stdout.write(JSON.stringify({ ok: true, value }));
} catch (error) {
  process.stdout.write(
    JSON.stringify({ ok: false, error: firstLine(error) }),
  );
  process.exitCode = 1;
}
