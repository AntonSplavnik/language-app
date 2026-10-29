import {
  ThemeKey,
  themeLabel,
  type WordListQuery,
  type WordSort,
  WordStatus,
} from "@language-app/core";

/**
 * My words' filter (§10 screen 7): one import's, one theme's or one group's words, chosen on the
 * Filter screen; null for all words. One at a time (M16 combines them).
 */
export type ListFilter =
  | { kind: "import"; importId: number }
  | { kind: "theme"; theme: ThemeKey }
  | { kind: "group"; groupId: number };

/**
 * The My words tab, search, sort and filter, kept in the URL so a reload or Back returns to the
 * same list. The sort applies to every list, filtered or not.
 */
export type ListQuery = {
  status: WordStatus;
  q: string;
  sort: WordSort;
  filter: ListFilter | null;
};

/** A list to link to; without a sort it is A–Z, without a filter all words. */
export type ListLink = Pick<ListQuery, "status" | "q"> & {
  sort?: WordSort;
  filter?: ListFilter | null;
};

export const TABS: Array<{ status: WordStatus; label: string }> = [
  { status: "learning", label: "Learning" },
  { status: "learned", label: "Learned" },
  { status: "ignored", label: "Ignored" },
];

/**
 * `/words?status=learned&q=tisch&sort=newest&import=5`; Learning when the status is missing or
 * unknown, A–Z unless `sort=newest`. The filter is `import=<id>`, `theme=<key>` or `group=<id>`
 * (the first of them when there are several); one it can't read is none, and stays in the URL.
 */
export function parseListQuery(params: URLSearchParams): ListQuery {
  const status = WordStatus.safeParse(params.get("status"));
  return {
    status: status.success ? status.data : "learning",
    q: (params.get("q") ?? "").trim(),
    sort: params.get("sort") === "newest" ? "newest" : "az",
    filter: parseFilter(params),
  };
}

function parseFilter(params: URLSearchParams): ListFilter | null {
  const importId = positiveInt(params.get("import"));
  if (importId !== null) return { kind: "import", importId };
  const theme = ThemeKey.safeParse(params.get("theme"));
  if (theme.success) return { kind: "theme", theme: theme.data };
  const groupId = positiveInt(params.get("group"));
  if (groupId !== null) return { kind: "group", groupId };
  return null;
}

const positiveInt = (text: string | null | undefined) =>
  text && /^[1-9]\d*$/.test(text) ? Number(text) : null;

/**
 * The URL query of a list: the search trimmed and left out when empty, the sort only when newest
 * first, then the filter.
 */
export function listParams({ status, q, sort = "az", filter = null }: ListLink): URLSearchParams {
  const params = new URLSearchParams({ status });
  if (q.trim()) params.set("q", q.trim());
  if (sort === "newest") params.set("sort", "newest");
  if (filter?.kind === "import") params.set("import", String(filter.importId));
  if (filter?.kind === "theme") params.set("theme", filter.theme);
  if (filter?.kind === "group") params.set("group", String(filter.groupId));
  return params;
}

export const wordsUrl = (query: ListLink) => `/words?${listParams(query)}`;

/** The Filter screen, carrying My words' query (§10 Filter). */
export const filterUrl = (query: ListLink) => `/words/filter?${listParams(query)}`;

/** Add to group, carrying My words' query, the list it returns to (§10 Add to group). */
export const addToGroupUrl = (query: ListLink) => `/words/add-to-group?${listParams(query)}`;

/** What to ask the server for a list (§9.1). */
export function listRequest({ status, q, sort, filter }: ListQuery): WordListQuery {
  const request: WordListQuery = { status, q };
  if (filter?.kind === "import") request.importId = filter.importId;
  if (filter?.kind === "theme") request.theme = filter.theme;
  if (filter?.kind === "group") request.groupId = filter.groupId;
  if (sort === "newest") request.sort = "newest";
  return request;
}

/** A string for a filter, equal for equal filters ("" for none), so effects compare it. */
export function filterKey(filter: ListFilter | null): string {
  if (!filter) return "";
  if (filter.kind === "import") return `import-${filter.importId}`;
  if (filter.kind === "theme") return `theme-${filter.theme}`;
  return `group-${filter.groupId}`;
}

/**
 * What the Filter pill says: "Filter" without a filter, else the filter's name (an import's label,
 * a theme's, a group's). While the imports or groups load, or when they failed, "One import" or
 * "One group"; a theme's label is known at once.
 */
export function filterText(
  filter: ListFilter | null,
  lists: {
    imports: Array<{ id: number; label: string }> | null;
    groups: Array<{ id: number; name: string }> | null;
  },
): string {
  if (!filter) return "Filter";
  if (filter.kind === "theme") return themeLabel(filter.theme);
  if (filter.kind === "import") {
    return lists.imports?.find((item) => item.id === filter.importId)?.label ?? "One import";
  }
  return lists.groups?.find((group) => group.id === filter.groupId)?.name ?? "One group";
}

/**
 * Whether the lists, once loaded, no longer offer the filter: an import whose words were all
 * deleted, a theme without words, a deleted group. My words then falls back to all words, keeping
 * the tab, search and sort. While a list loads, or when it couldn't be loaded (null), its filters
 * stay.
 */
export function filterGone(
  filter: ListFilter | null,
  lists: {
    imports: Array<{ id: number }> | null;
    themes: Array<{ key: ThemeKey }> | null;
    groups: Array<{ id: number }> | null;
  },
): boolean {
  if (filter?.kind === "import") {
    return lists.imports !== null && !lists.imports.some((item) => item.id === filter.importId);
  }
  if (filter?.kind === "theme") {
    return lists.themes !== null && !lists.themes.some((item) => item.key === filter.theme);
  }
  if (filter?.kind === "group") {
    return lists.groups !== null && !lists.groups.some((item) => item.id === filter.groupId);
  }
  return false;
}

/**
 * The list's headings: without a search, newest first splits it by day and A–Z by letter, for
 * every list, filtered or not; while searching it is one flat list.
 */
export const sectionsBy = ({
  sort,
  q,
}: Pick<ListQuery, "sort" | "q">): "day" | "letter" | "none" =>
  q ? "none" : sort === "newest" ? "day" : "letter";

/** What a filter's empty tab says: "No learned words in this group." */
export function emptyFilterText(status: WordStatus, filter: ListFilter): string {
  const tab = TABS.find((each) => each.status === status)?.label.toLowerCase();
  const where = {
    import: "from this import",
    theme: "in this theme",
    group: "in this group",
  }[filter.kind];
  return `No ${tab} words ${where}.`;
}
