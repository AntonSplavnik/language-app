import { WordStatus } from "@language-app/core";

/** The My words tab and search, kept in the URL so a reload or Back returns to the same list. */
export type ListQuery = { status: WordStatus; q: string };

export const TABS: Array<{ status: WordStatus; label: string }> = [
  { status: "learning", label: "Learning" },
  { status: "learned", label: "Learned" },
  { status: "ignored", label: "Ignored" },
];

/** `/words?status=learned&q=tisch`; Learning when the status is missing or unknown. */
export function parseListQuery(params: URLSearchParams): ListQuery {
  const status = WordStatus.safeParse(params.get("status"));
  return {
    status: status.success ? status.data : "learning",
    q: (params.get("q") ?? "").trim(),
  };
}

/** The URL query of a tab and search; the search is trimmed and left out when empty. */
export function listParams({ status, q }: ListQuery): URLSearchParams {
  const params = new URLSearchParams({ status });
  if (q.trim()) params.set("q", q.trim());
  return params;
}

export const wordsUrl = (query: ListQuery) => `/words?${listParams(query)}`;
