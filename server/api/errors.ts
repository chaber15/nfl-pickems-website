/** An error whose message is safe to show to the client, with a real HTTP status. */
export class HttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export interface ErrorBody {
  error: string;
  code?: string;
}

/**
 * Map any thrown value to a status + client-safe body.
 * - HttpError → its own status/message/code.
 * - SyntaxError (JSON body parse) → 400 "Invalid request".
 * - Anything else → 500 generic; the details go to the server log only.
 */
export function errorToResponse(
  err: unknown,
  log: (...args: unknown[]) => void = console.error,
): { status: number; body: ErrorBody } {
  if (err instanceof HttpError) {
    const body: ErrorBody = { error: err.message };
    if (err.code) body.code = err.code;
    return { status: err.status, body };
  }
  if (err instanceof SyntaxError) {
    return { status: 400, body: { error: "Invalid request", code: "INVALID_REQUEST" } };
  }
  log("[api] unhandled error:", err);
  return { status: 500, body: { error: "Something went wrong" } };
}
