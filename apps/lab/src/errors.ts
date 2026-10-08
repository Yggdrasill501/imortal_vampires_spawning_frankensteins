import type { ErrorCode } from "@repo/contract";

export class LabHttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "LabHttpError";
    this.code = code;
    this.status = statusFor(code);
  }
}

export const NOT_FOUND = new LabHttpError(
  "not_found",
  "Nothing by that name exists in the lab.",
);
export const INTERNAL = new LabHttpError(
  "internal",
  "The lab failed to do that. Nothing was changed.",
);
export const DATABASE_UNREACHABLE = new LabHttpError(
  "internal",
  "The lab cannot reach its database.",
);

export function invalid(message: string): LabHttpError {
  return new LabHttpError("invalid", ensureStop(message));
}

export function stateChanged(message: string): LabHttpError {
  return new LabHttpError("state_changed", ensureStop(message));
}

export function ensureStop(message: string): string {
  const text = message.trim();
  return text.endsWith(".") ? text : `${text}.`;
}

function statusFor(code: ErrorCode): number {
  if (code === "invalid") return 400;
  if (code === "not_found") return 404;
  if (code === "state_changed") return 409;
  return 500;
}
