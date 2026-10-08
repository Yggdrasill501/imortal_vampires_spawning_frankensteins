import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

export interface Config {
  readonly repoRoot: string;
  readonly databaseUrl: string;
  readonly port: number;
  readonly host: string;
  readonly webOrigins: readonly string[];
  readonly shelfDir: string;
  readonly dataDir: string;
  readonly model: string;
  readonly maxMonsters: number;
  readonly maxRuns: number;
  readonly readTimeoutMs: number;
  readonly monsterTimeoutMs: number;
  readonly runTimeoutMs: number;
  readonly dispatchIntervalMs: number;
  readonly logLevel: string;
  readonly agentUseApiKey: boolean;
  readonly cursorApiKey: string | null;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const envFile = path.join(REPO_ROOT, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const cursorApiKey = process.env.CURSOR_API_KEY || null;
  delete process.env.CURSOR_API_KEY;

  const databaseUrl = required("DATABASE_URL", overrides.databaseUrl ?? process.env.DATABASE_URL);
  const config: Config = Object.freeze({
    repoRoot: REPO_ROOT,
    databaseUrl,
    port: intEnv("LAB_PORT", 4000, overrides.port),
    host: stringEnv("LAB_HOST", "localhost", overrides.host),
    webOrigins: (
      overrides.webOrigins ??
      csvEnv("LAB_WEB_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    ).map((origin) => origin.trim()).filter(Boolean),
    shelfDir: path.resolve(REPO_ROOT, stringEnv("LAB_SHELF_DIR", "shelf", overrides.shelfDir)),
    dataDir: path.resolve(REPO_ROOT, stringEnv("LAB_DATA_DIR", ".lab", overrides.dataDir)),
    model: stringEnv("LAB_MODEL", "auto", overrides.model),
    maxMonsters: intEnv("LAB_MAX_MONSTERS", 3, overrides.maxMonsters),
    maxRuns: intEnv("LAB_MAX_RUNS", 2, overrides.maxRuns),
    readTimeoutMs: intEnv("LAB_READ_TIMEOUT_MS", 300_000, overrides.readTimeoutMs),
    monsterTimeoutMs: intEnv("LAB_MONSTER_TIMEOUT_MS", 1_200_000, overrides.monsterTimeoutMs),
    runTimeoutMs: intEnv("LAB_RUN_TIMEOUT_MS", 120_000, overrides.runTimeoutMs),
    dispatchIntervalMs: intEnv("LAB_DISPATCH_INTERVAL_MS", 1000, overrides.dispatchIntervalMs),
    logLevel: stringEnv("LAB_LOG_LEVEL", "info", overrides.logLevel),
    agentUseApiKey: boolEnv("LAB_AGENT_USE_API_KEY", false, overrides.agentUseApiKey),
    cursorApiKey,
  });
  return config;
}

export async function ensureLabDirs(config: Config): Promise<void> {
  await mkdir(config.shelfDir, { recursive: true });
  await mkdir(path.join(config.dataDir, "workspaces"), { recursive: true });
}

export function agentEnvironment(config: Config): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
  };
  if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
  if (config.agentUseApiKey && config.cursorApiKey) {
    env.CURSOR_API_KEY = config.cursorApiKey;
  }
  return env;
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not valid.`);
  return value;
}

function stringEnv(name: string, fallback: string, override?: string): string {
  if (override !== undefined) return override;
  const raw = process.env[name];
  return raw === undefined || raw === "" ? fallback : raw;
}

function csvEnv(name: string, fallback: string): string[] {
  return stringEnv(name, fallback).split(",");
}

function intEnv(name: string, fallback: number, override?: number): number {
  if (override !== undefined) return override;
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} is not valid.`);
  return value;
}

function boolEnv(name: string, fallback: boolean, override?: boolean): boolean {
  if (override !== undefined) return override;
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (raw === "1") return true;
  if (raw === "0") return false;
  throw new Error(`${name} is not valid.`);
}
