import { ThemeKey, type WordListQuery, WordStatus } from "@language-app/core";

/**
 * My words' view menu (§10): all words A–Z, all words newest first, or one import's or one theme's
 * words A–Z.
 */
export type ListView =
  | { kind: "az" }
  | { kind: "newest" }
  | { kind: "import"; importId: number }
  | { kind: "theme"; theme: ThemeKey };

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
 * view is `import=<id>` or `theme=<key>` (A–Z within it), else `sort=newest`, else A–Z.
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
  const theme = ThemeKey.safeParse(params.get("theme"));
  if (theme.success) return { kind: "theme", theme: theme.data };
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
  if (view.kind === "theme") params.set("theme", view.theme);
  return params;
}

export const wordsUrl = (query: ListLink) => `/words?${listParams(query)}`;

/** What to ask the server for a list (§9.1). */
export function listRequest({ status, q, view }: ListQuery): WordListQuery {
  if (view.kind === "newest") return { status, q, sort: "newest" };
  if (view.kind === "import") return { status, q, importId: view.importId };
  if (view.kind === "theme") return { status, q, theme: view.theme };
  return { status, q };
}

/** The view menu's value for a view: "az", "newest", "import-5" or "theme-home". */
export function viewValue(view: ListView): string {
  if (view.kind === "import") return `import-${view.importId}`;
  if (view.kind === "theme") return `theme-${view.theme}`;
  return view.kind;
}

/** The view a menu value stands for; A–Z for anything else. */
export function viewFromValue(value: string): ListView {
  if (value === "newest") return { kind: "newest" };
  const theme = ThemeKey.safeParse(/^theme-(.+)$/.exec(value)?.[1]);
  if (theme.success) return { kind: "theme", theme: theme.data };
  const importId = positiveInt(/^import-(.+)$/.exec(value)?.[1]);
  return importId === null ? AZ : { kind: "import", importId };
}

/**
 * Whether the view menu, once loaded, no longer offers the view: an import whose words were all
 * deleted, a theme without words. My words then falls back to All words · A–Z. While a part of the
 * menu loads, or when it couldn't be loaded (null), its views stay.
 */
export function viewGone(
  view: ListView,
  menu: { imports: Array<{ id: number }> | null; themes: Array<{ key: ThemeKey }> | null },
): boolean {
  if (view.kind === "import") {
    return menu.imports !== null && !menu.imports.some((item) => item.id === view.importId);
  }
  if (view.kind === "theme") {
    return menu.themes !== null && !menu.themes.some((item) => item.key === view.theme);
  }
  return false;
}
