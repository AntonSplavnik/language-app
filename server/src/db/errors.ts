/** PostgreSQL error code of a failed query, looking through Drizzle's wrapper errors. */
export function pgErrorCode(error: unknown): string | undefined {
  for (let e = error; e instanceof Error || (e && typeof e === "object"); ) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string") return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

export const isUniqueViolation = (error: unknown) => pgErrorCode(error) === "23505";
