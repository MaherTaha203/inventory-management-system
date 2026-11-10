export type AppErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "NETWORK"
  | "PERMISSION"
  | "UNKNOWN";

export interface AppError {
  code: AppErrorCode;
  message: string;
  cause?: unknown;
}

export type Result<T, E = AppError> =
  | { ok: true; data: T }
  | { ok: false; error: E };

export function success<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function failure<T = never>(
  code: AppErrorCode,
  message: string,
  cause?: unknown,
): Result<T> {
  return { ok: false, error: { code, message, cause } };
}
