import type { z } from "zod";
import { ApiError } from "./schemas/common";
import { HealthResponse } from "./schemas/health";
import { StatsResponse } from "./schemas/stats";

/** Every failed API call: an error from the server, an unexpected response, or no connection. */
export class ApiClientError extends Error {
  constructor(
    /** Server error code, or `http_error`, `invalid_response`, `network`. */
    readonly code: string,
    message: string,
    /** HTTP status; null when the request never got a response. */
    readonly status: number | null,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export type ApiClientOptions = {
  /** Origin of the web app or server; empty for same-origin requests. */
  baseUrl?: string;
  fetch: typeof fetch;
};

export function createApiClient({ baseUrl = "", fetch }: ApiClientOptions) {
  async function request<S extends z.ZodType>(
    schema: S,
    path: string,
    init?: RequestInit,
  ): Promise<z.infer<S>> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api${path}`, init);
    } catch {
      throw new ApiClientError("network", "Can't reach the server", null);
    }

    const body: unknown = await res.json().catch(() => undefined);

    if (!res.ok) {
      const error = ApiError.safeParse(body);
      if (error.success) {
        throw new ApiClientError(error.data.error.code, error.data.error.message, res.status);
      }
      throw new ApiClientError("http_error", `Request failed (${res.status})`, res.status);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ApiClientError("invalid_response", `Unexpected response from ${path}`, res.status);
    }
    return parsed.data;
  }

  return {
    health: () => request(HealthResponse, "/health"),
    stats: () => request(StatsResponse, "/stats"),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
