import { type WordListQuery, WordStatus } from "@language-app/core";

/** My words' view menu (§10): all words A–Z, all words newest first, or one import's words A–Z. */
export type ListView = { kind: "az" } | { kind: "newest" } | { kind: "import"; importId: number };

/** The My words tab, search and view, kept in the URL so a reload or Back returns to the same list. */
export type ListQuery = { status: WordStatus; q: string; view: ListView };

/** A list to link to; without a view it is All words · A–Z. */
export type ListLink = Omit<ListQuery, "view"> & { view?: ListView };

const AZ: ListView = { kind: "az" };

export const TABS: Array<{ status: WordStatus; label: string }> = [
  { status: "learning", label: "Learning" },
  { status: "learned", label: "Learned" },
  { status: "ignored", label: "Ignored" },
];

/**
 * `/words?status=learned&q=tisch&import=5`; Learning when the status is missing or unknown. The
 * view is `import=<id>` (A–Z within it), else `sort=newest`, else A–Z.
 */
export function parseListQuery(params: URLSearchParams): ListQuery {
  const status = WordStatus.safeParse(params.get("status"));
  return {
    status: status.success ? status.data : "learning",
    q: (params.get("q") ?? "").trim(),
    view: parseView(params),
  };
}

function parseView(params: URLSearchParams): ListView {
  const importId = positiveInt(params.get("import"));
  if (importId !== null) return { kind: "import", importId };
  return params.get("sort") === "newest" ? { kind: "newest" } : AZ;
}

const positiveInt = (text: string | null | undefined) =>
  text && /^[1-9]\d*$/.test(text) ? Number(text) : null;

/** The URL query of a list: the search trimmed and left out when empty, the view only when not A–Z. */
export function listParams({ status, q, view = AZ }: ListLink): URLSearchParams {
  const params = new URLSearchParams({ status });
  if (q.trim()) params.set("q", q.trim());
  if (view.kind === "newest") params.set("sort", "newest");
  if (view.kind === "import") params.set("import", String(view.importId));
  return params;
}

export const wordsUrl = (query: ListLink) => `/words?${listParams(query)}`;

/** What to ask the server for a list (§9.1). */
export function listRequest({ status, q, view }: ListQuery): WordListQuery {
  if (view.kind === "newest") return { status, q, sort: "newest" };
  if (view.kind === "import") return { status, q, importId: view.importId };
  return { status, q };
}

/** The view menu's value for a view: "az", "newest" or "import-5". */
export const viewValue = (view: ListView) =>
  view.kind === "import" ? `import-${view.importId}` : view.kind;

/** The view a menu value stands for; A–Z for anything else. */
export function viewFromValue(value: string): ListView {
  if (value === "newest") return { kind: "newest" };
  const importId = positiveInt(/^import-(.+)$/.exec(value)?.[1]);
  return importId === null ? AZ : { kind: "import", importId };
}
