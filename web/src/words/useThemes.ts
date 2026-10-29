import type { ThemeSummary } from "@language-app/core";
import { useEffect, useState } from "react";
import { api } from "../api";
import { errorMessage } from "../lib/toast";

/** The learner's themes with their counts (§9.1) as a screen holds them while they load. */
export type Themes =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; themes: ThemeSummary[] };

/** Loads the learner's themes once (My words' view menu). */
export function useThemes(): Themes {
  const [state, setState] = useState<Themes>({ kind: "loading" });

  useEffect(() => {
    api.listThemes().then(
      ({ themes }) => setState({ kind: "ready", themes }),
      (error) => setState({ kind: "error", message: errorMessage(error) }),
    );
  }, []);

  return state;
}
