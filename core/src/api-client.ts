import type { z } from "zod";
import {
  AuthErrorBody,
  AuthSession,
  type DeleteAccountRequest,
  DeleteAccountResponse,
  type LinkSocialRequest,
  SignedInResponse,
  type SignInEmailRequest,
  SignInMethods,
  SignInOptions,
  type SignInUsernameRequest,
  SignOutResponse,
  type SignUpRequest,
  SocialRedirectResponse,
  type SocialSignInRequest,
  type UnlinkAccountRequest,
  UnlinkAccountResponse,
} from "./schemas/auth";
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
  type AddWordsRequest,
  AddWordsResponse,
  type DescribeRequest,
  DescribeResponse,
  LookupResponse,
  SuggestResponse,
  type TypedImportRequest,
  TypedImportResponse,
  type TypedWord,
} from "./schemas/typed";
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
    /**
     * Server error code (ours, or Better Auth's such as `INVALID_EMAIL_OR_PASSWORD`), or
     * `unauthorized` (a 401), `too_many_requests` (a 429), `http_error`, `invalid_response`,
     * `network`.
     */
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
      // Better Auth's endpoints answer `{ code, message }` instead (§12).
      const authError = AuthErrorBody.safeParse(body);
      if (authError.success) {
        const { code, message } = authError.data;
        throw new ApiClientError(code ?? codeForStatus(res.status), message, res.status);
      }
      throw new ApiClientError(
        codeForStatus(res.status),
        `Request failed (${res.status})`,
        res.status,
      );
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

    /** The signed-in account, or null; also keeps the session cookie fresh (§4 Accounts, Sessions). */
    getSession: () => request(AuthSession, "/auth/get-session"),
    /** Create account: signs the new account in (§9.4). */
    signUp: (body: SignUpRequest) => postJson(SignedInResponse, "/auth/sign-up/email", body),
    signInEmail: (body: SignInEmailRequest) =>
      postJson(SignedInResponse, "/auth/sign-in/email", body),
    signInUsername: (body: SignInUsernameRequest) =>
      postJson(SignedInResponse, "/auth/sign-in/username", body),
    /**
     * Continue with Google: Google's address, for the browser to open. Google sends it back to
     * the server, which redirects to `callbackURL`, or to `errorCallbackURL?error=<code>` (§9.4).
     */
    signInSocial: (body: SocialSignInRequest) =>
      postJson(SocialRedirectResponse, "/auth/sign-in/social", body),
    /** Connect Google to the signed-in account, the same way round (§9.4). */
    linkSocial: (body: LinkSocialRequest) =>
      postJson(SocialRedirectResponse, "/auth/link-social", body),
    /** Whether the server offers Google (it has the Google pair). Open to everyone. */
    signInOptions: () => request(SignInOptions, "/sign-in-options"),
    /** Ends this sign-in only. */
    signOut: () => postJson(SignOutResponse, "/auth/sign-out"),
    /** How the account signs in: a password (`credential`), Google (`google`) (§9.4). */
    listAccounts: () => request(SignInMethods, "/auth/list-accounts"),
    /** Disconnect: removes one sign-in method (Google), by its id from `listAccounts` (§9.4). */
    unlinkAccount: (body: UnlinkAccountRequest) =>
      postJson(UnlinkAccountResponse, "/auth/unlink-account", body),
    /** Deletes the account and all its data; with its password when it has one (§9.4). */
    deleteAccount: (body: DeleteAccountRequest) =>
      postJson(DeleteAccountResponse, "/auth/delete-user", body),

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
    /** A typed list, saved as one import (§9.3); `importId` is null when nothing was added. */
    saveTypedImport: (words: TypedWord[]) =>
      postJson(TypedImportResponse, "/imports/typed", { words } satisfies TypedImportRequest),

    /** Dictionary entries for the letters typed so far (§9.3). */
    suggest: (q: string) => request(SuggestResponse, `/dictionary/suggest${queryString({ q })}`),
    /** The dictionary entries, base words or similar words for one typed word (§9.3). */
    lookup: (q: string) => request(LookupResponse, `/dictionary/lookup${queryString({ q })}`),
    /** Ask AI (Call 3): the word meant by the text, or with `entryId` a translation for it. */
    describeWord: (body: DescribeRequest) => postJson(DescribeResponse, "/words/describe", body),
    /** The entries chosen for one typed text, saved without an import (§9.3). */
    addWords: (words: TypedWord[]) =>
      postJson(AddWordsResponse, "/words", { words } satisfies AddWordsRequest),

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

/**
 * The code of an error answer without a body we can read: any 401 means the session is gone, and
 * Better Auth's rate limiter answers 429 with only a message (§12).
 */
function codeForStatus(status: number): string {
  if (status === 401) return "unauthorized";
  if (status === 429) return "too_many_requests";
  return "http_error";
}

/** `?a=1&b=2` from the given values, leaving out empty ones; "" when nothing is left. */
function queryString(params: Record<string, string | number | undefined>): string {
  const pairs = Object.entries(params).flatMap(([key, value]) =>
    value !== undefined && value !== ""
      ? [`${encodeURIComponent(key)}=${encodeURIComponent(value)}`]
      : [],
  );
  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}
