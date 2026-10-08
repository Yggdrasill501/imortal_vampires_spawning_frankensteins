import type { LabClient } from "./client";
import { createHttpClient } from "./http";
import { createMockClient } from "./mock/client";

/** Simulated data is on unless NEXT_PUBLIC_LAB_MOCK is "0". */
export const MOCK_ENABLED = process.env.NEXT_PUBLIC_LAB_MOCK !== "0";

let client: LabClient | null = null;

/** The one lab client for this browser tab. Call it in the browser only. */
export function getLabClient(): LabClient {
  client ??= MOCK_ENABLED ? createMockClient() : createHttpClient();
  return client;
}

export * from "./client";
