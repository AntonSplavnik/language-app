import type {
  CreateSessionRequest,
  GroupSummary,
  SessionOptionsResponse,
  SessionSource,
  ThemeKey,
} from "@language-app/core";
import { type InputHTMLAttributes, type ReactNode, useEffect, useState } from "react";
import { api } from "../api";
import {
  CalendarIcon,
  CameraIcon,
  FolderIcon,
  PlayIcon,
  TagIcon,
  TargetIcon,
} from "../components/icons";
import { Page } from "../components/Page";
import { SelectPill } from "../components/SelectPill";
import { type LabelledImport, labelImports } from "../imports/labels";
import { errorMessage, useToast } from "../lib/toast";
import { countParts, groupMenu, type LabelledTheme, themeMenu } from "../practice/sources";
import { useStartSession } from "../practice/useStartSession";
import ui from "../styles/ui.module.css";
import styles from "./PracticeSetupScreen.module.css";

const LABELS: Record<SessionSource, { title: string; description: string; icon: ReactNode }> = {
  import: {
    title: "Import",
    // Shown only while there is no past import; otherwise the menu of imports takes its place.
    description: "The words of one import",
    icon: <CameraIcon size={22} />,
  },
  group: {
    title: "Group",
    // Shown only while no group has words to practise; otherwise the menu of groups takes its place.
    description: "Words of one of your groups",
    icon: <FolderIcon size={22} />,
  },
  theme: {
    title: "Theme",
    // Shown only while no theme has words to practise; otherwise the menu of themes takes its place.
    description: "Words of one theme",
    icon: <TagIcon size={22} />,
  },
  last_7_days: {
    title: "Last 7 days",
    description: "Everything added this week",
    icon: <CalendarIcon size={22} />,
  },
  not_learned: {
    title: "Not learned yet",
    description: "Words you missed come first",
    icon: <TargetIcon size={22} />,
  },
};

type Loaded = {
  options: SessionOptionsResponse["options"];
  imports: LabelledImport[];
  groups: GroupSummary[];
  themes: LabelledTheme[];
};

/**
 * Choose what to practise (§8.1). The first source with words is preselected, the Import menu
 * starts on the most recent past import, the Group menu on the newest group with words to practise
 * and the Theme menu on the theme with the most: two taps to start.
 */
export function PracticeSetupScreen() {
  const toast = useToast();
  const { start, starting } = useStartSession();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [selected, setSelected] = useState<SessionSource | null>(null);
  const [importId, setImportId] = useState<number | null>(null);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [theme, setTheme] = useState<ThemeKey | null>(null);

  useEffect(() => {
    Promise.all([api.sessionOptions(), api.listImports(), api.listGroups(), api.listThemes()]).then(
      ([{ options }, { imports }, { groups: allGroups }, { themes: summaries }]) => {
        const groups = groupMenu(allGroups);
        const menu = themeMenu(summaries);
        setLoaded({
          options,
          imports: labelImports(imports),
          groups: groups.groups,
          themes: menu.themes,
        });
        setImportId(imports[0]?.id ?? null);
        setGroupId(groups.start);
        setTheme(menu.start);
        // The Import, Group and Theme cards count what their menus start on.
        const starting: Partial<Record<SessionSource, number>> = {
          import: imports[0]?.wordCount ?? 0,
          group: groups.groups[0]?.practisable ?? 0,
          theme: menu.themes.find((item) => item.key === menu.start)?.practisable ?? 0,
        };
        setSelected(options.find((o) => (starting[o.source] ?? o.count) > 0)?.source ?? null);
      },
      (error) => toast.show(errorMessage(error)),
    );
  }, [toast]);

  const chosenImport = loaded?.imports.find((item) => item.id === importId);
  const chosenGroup = loaded?.groups.find((item) => item.id === groupId);
  const chosenTheme = loaded?.themes.find((item) => item.key === theme);
  const countOf = (source: SessionSource, count: number) => {
    if (source === "import") return chosenImport?.wordCount ?? 0;
    if (source === "group") return chosenGroup?.practisable ?? 0;
    if (source === "theme") return chosenTheme?.practisable ?? 0;
    return count;
  };
  const choiceOf = (source: SessionSource | null): CreateSessionRequest | null => {
    if (source === "import") return chosenImport ? { source, importId: chosenImport.id } : null;
    if (source === "group") return chosenGroup ? { source, groupId: chosenGroup.id } : null;
    if (source === "theme") return chosenTheme ? { source, theme: chosenTheme.key } : null;
    return source && { source };
  };
  const choice = choiceOf(selected);

  return (
    <Page
      largeTitle="Practice"
      back="/"
      footer={
        <button
          type="button"
          className={`${ui.button} ${ui.primary} ${ui.cta}`}
          disabled={!choice || starting}
          onClick={() => choice && start(choice)}
        >
          {starting && <span className={ui.spinner} />}
          Start
          <PlayIcon size={20} />
        </button>
      }
    >
      {!loaded && <p className={styles.muted}>Loading…</p>}
      {loaded && (
        <fieldset className={styles.options}>
          <legend className={styles.legend}>What to practise</legend>
          {loaded.options.map(({ source, count: listed }) => {
            const count = countOf(source, listed);
            const radio = {
              type: "radio",
              name: "source",
              value: source,
              className: styles.radio,
              checked: selected === source,
              disabled: count === 0,
              onChange: () => setSelected(source),
            } as const;
            const cardClass = `${ui.card} ${styles.option} ${
              selected === source ? styles.selected : ""
            } ${count === 0 ? styles.disabled : ""}`;

            if (source === "import" && loaded.imports.length > 0) {
              return (
                <MenuOption
                  key={source}
                  source={source}
                  className={cardClass}
                  radio={radio}
                  count={count}
                  label="Import to practise"
                  text={chosenImport?.label ?? ""}
                  value={String(importId ?? "")}
                  onChange={(value) => {
                    // Choosing an import also chooses the card.
                    setImportId(Number(value));
                    setSelected("import");
                  }}
                >
                  {loaded.imports.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </MenuOption>
              );
            }

            if (source === "group" && loaded.groups.length > 0) {
              return (
                <MenuOption
                  key={source}
                  source={source}
                  className={cardClass}
                  radio={radio}
                  count={count}
                  label="Group to practise"
                  text={chosenGroup?.name ?? ""}
                  value={String(groupId ?? "")}
                  onChange={(value) => {
                    // Choosing a group also chooses the card.
                    setGroupId(Number(value));
                    setSelected("group");
                  }}
                >
                  {loaded.groups.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </MenuOption>
              );
            }

            if (source === "theme" && loaded.themes.length > 0) {
              return (
                <MenuOption
                  key={source}
                  source={source}
                  className={cardClass}
                  radio={radio}
                  count={count}
                  label="Theme to practise"
                  text={chosenTheme?.label ?? ""}
                  value={theme ?? ""}
                  onChange={(value) => {
                    // Choosing a theme also chooses the card.
                    setTheme(value as ThemeKey);
                    setSelected("theme");
                  }}
                >
                  {loaded.themes.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </MenuOption>
              );
            }

            return (
              <label key={source} className={cardClass}>
                <input {...radio} />
                <span className={styles.well}>{LABELS[source].icon}</span>
                <span className={styles.text}>
                  <span className={styles.title}>{LABELS[source].title}</span>
                  <span className={styles.description}>{LABELS[source].description}</span>
                </span>
                <Count count={count} />
              </label>
            );
          })}
        </fieldset>
      )}
      {loaded?.options.every((o) => countOf(o.source, o.count) === 0) && (
        <p className={styles.muted}>Import some pages first; their words will show up here.</p>
      )}
    </Page>
  );
}

/**
 * A source card with a menu in place of its description (Import, Group, Theme). The menu can't sit inside
 * the label (a label holds one control), so the label's parts join the card's grid and a layer of
 * it covers the card; the menu sits above.
 */
function MenuOption({
  source,
  className,
  radio,
  count,
  label,
  text,
  value,
  onChange,
  children,
}: {
  source: SessionSource;
  className: string;
  radio: InputHTMLAttributes<HTMLInputElement>;
  count: number;
  /** The menu's accessible name. */
  label: string;
  /** The chosen option's text. */
  text: string;
  value: string;
  onChange: (value: string) => void;
  /** The `<option>`s. */
  children: ReactNode;
}) {
  return (
    <div className={`${className} ${styles.menuOption}`}>
      <label className={styles.menuLabel}>
        <input {...radio} />
        <span className={styles.well}>{LABELS[source].icon}</span>
        <span className={styles.title}>{LABELS[source].title}</span>
        <Count count={count} />
      </label>
      <SelectPill
        onCard
        className={styles.menu}
        label={label}
        text={text}
        value={value}
        onChange={onChange}
      >
        {children}
      </SelectPill>
    </div>
  );
}

/** "20" over "of 149 words", or "No words". */
function Count({ count }: { count: number }) {
  const { number, rest } = countParts(count);
  return (
    <span className={styles.count}>
      {number !== null && <span className={styles.number}>{number}</span>}
      <span className={number === null ? styles.none : styles.rest}>{rest}</span>
    </span>
  );
}
