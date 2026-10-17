import type {
  CreateSessionRequest,
  SessionOptionsResponse,
  SessionSource,
} from "@language-app/core";
import { type ReactNode, useEffect, useState } from "react";
import { api } from "../api";
import { CalendarIcon, CameraIcon, PlayIcon, TargetIcon } from "../components/icons";
import { Page } from "../components/Page";
import { SelectPill } from "../components/SelectPill";
import { type LabelledImport, labelImports } from "../imports/labels";
import { errorMessage, useToast } from "../lib/toast";
import { countParts } from "../practice/sources";
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

type Loaded = { options: SessionOptionsResponse["options"]; imports: LabelledImport[] };

/**
 * Choose what to practise (§8.1). The first source with words is preselected, and the Import menu
 * starts on the most recent past import: two taps to start.
 */
export function PracticeSetupScreen() {
  const toast = useToast();
  const { start, starting } = useStartSession();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [selected, setSelected] = useState<SessionSource | null>(null);
  const [importId, setImportId] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([api.sessionOptions(), api.listImports()]).then(
      ([{ options }, { imports }]) => {
        setLoaded({ options, imports: labelImports(imports) });
        setImportId(imports[0]?.id ?? null);
        // The Import card counts the import its menu shows, the most recent one.
        const latest = imports[0]?.wordCount ?? 0;
        setSelected(
          options.find((o) => (o.source === "import" ? latest : o.count) > 0)?.source ?? null,
        );
      },
      (error) => toast.show(errorMessage(error)),
    );
  }, [toast]);

  const chosenImport = loaded?.imports.find((item) => item.id === importId);
  const countOf = (source: SessionSource, count: number) =>
    source === "import" ? (chosenImport?.wordCount ?? 0) : count;
  const choice: CreateSessionRequest | null =
    selected === "import"
      ? chosenImport
        ? { source: "import", importId: chosenImport.id }
        : null
      : selected && { source: selected };

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
              // The menu can't sit inside the label (a label holds one control), so the label's
              // parts join the card's grid and a layer of it covers the card; the menu sits above.
              return (
                <div key={source} className={`${cardClass} ${styles.importOption}`}>
                  <label className={styles.importLabel}>
                    <input {...radio} />
                    <span className={styles.well}>{LABELS[source].icon}</span>
                    <span className={styles.title}>{LABELS[source].title}</span>
                    <Count count={count} />
                  </label>
                  <SelectPill
                    onCard
                    className={styles.menu}
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
                  </SelectPill>
                </div>
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
