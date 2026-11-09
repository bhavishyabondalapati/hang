export type ErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "RATE_LIMITED" | "LIMIT" | "CONFLICT";

export class AppError extends Error {
  constructor(public code: ErrorCode, message: string, public fields?: Record<string, string[] | undefined>) {
    super(message);
  }
  get status() {
    return { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, INVALID: 400, RATE_LIMITED: 429, LIMIT: 422, CONFLICT: 409 }[this.code];
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string; fields?: Record<string, string[] | undefined> };

export function toResult(e: unknown): { ok: false; code: ErrorCode; message: string; fields?: Record<string, string[] | undefined> } {
  if (e instanceof AppError) return { ok: false, code: e.code, message: e.message, fields: e.fields };
  console.error(e);
  return { ok: false, code: "INVALID", message: "Something went wrong. Please try again." };
}
