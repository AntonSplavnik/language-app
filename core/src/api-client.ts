import type { z } from "zod";
import { ApiError } from "./schemas/common";
import { HealthResponse } from "./schemas/health";
import {
  type CreateImportRequest,
  ImportListResponse,
  ImportView,
  PhotoUploadResponse,
  type RenameImportRequest,
  RenameImportResponse,
  type SaveDecision,
  type SaveRequest,
  SaveResponse,
} from "./schemas/imports";
import {
  type CardResultRequest,
  CardResultResponse,
  type CreateSessionRequest,
  SessionOptionsResponse,
  SessionResponse,
  SessionSummary,
} from "./schemas/sessions";
import { StatsResponse } from "./schemas/stats";
import {
  DeleteWordResponse,
  EnrichPendingResponse,
  type UpdateWordRequest,
  WordDetail,
  type WordListQuery,
  WordListResponse,
} from "./schemas/words";

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

  const sendJson = <S extends z.ZodType>(
    schema: S,
    method: "POST" | "PATCH",
    path: string,
    body?: unknown,
  ) =>
    request(schema, path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  const postJson = <S extends z.ZodType>(schema: S, path: string, body?: unknown) =>
    sendJson(schema, "POST", path, body);

  return {
    health: () => request(HealthResponse, "/health"),
    stats: () => request(StatsResponse, "/stats"),

    /** The past imports (§9.2), newest first. */
    listImports: () => request(ImportListResponse, "/imports"),
    createImport: (body: CreateImportRequest = {}) => postJson(ImportView, "/imports", body),
    /** A new name, or null (or blank) to clear it. */
    renameImport: (id: number, name: string | null) =>
      sendJson(RenameImportResponse, "PATCH", `/imports/${id}`, {
        name,
      } satisfies RenameImportRequest),
    getImport: (id: number) => request(ImportView, `/imports/${id}`),
    /** One already-shrunk JPEG per request (§6.2). */
    uploadPhoto: (id: number, jpeg: Blob) => {
      const form = new FormData();
      form.append("photo", jpeg, "photo.jpg");
      return request(PhotoUploadResponse, `/imports/${id}/photos`, { method: "POST", body: form });
    },
    startReview: (id: number) => postJson(ImportView, `/imports/${id}/review`),
    saveImport: (id: number, decisions: SaveDecision[]) =>
      postJson(SaveResponse, `/imports/${id}/save`, { decisions } satisfies SaveRequest),

    /** Retries enrichment for the learner's words that have no details yet. */
    enrichPending: () => postJson(EnrichPendingResponse, "/words/enrich-pending"),
    listWords: (query: WordListQuery = {}) =>
      request(WordListResponse, `/words${queryString(query)}`),
    getWord: (id: number) => request(WordDetail, `/words/${id}`),
    updateWord: (id: number, body: UpdateWordRequest) =>
      sendJson(WordDetail, "PATCH", `/words/${id}`, body),
    deleteWord: (id: number) => request(DeleteWordResponse, `/words/${id}`, { method: "DELETE" }),

    sessionOptions: () => request(SessionOptionsResponse, "/sessions/options"),
    createSession: (body: CreateSessionRequest) => postJson(SessionResponse, "/sessions", body),
    recordResult: (sessionId: number, body: CardResultRequest) =>
      postJson(CardResultResponse, `/sessions/${sessionId}/results`, body),
    finishSession: (sessionId: number) => postJson(SessionSummary, `/sessions/${sessionId}/finish`),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** `?a=1&b=2` from the given values, leaving out empty ones; "" when nothing is left. */
function queryString(params: Record<string, string | number | undefined>): string {
  const pairs = Object.entries(params).flatMap(([key, value]) =>
    value !== undefined && value !== ""
      ? [`${encodeURIComponent(key)}=${encodeURIComponent(value)}`]
      : [],
  );
  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}
