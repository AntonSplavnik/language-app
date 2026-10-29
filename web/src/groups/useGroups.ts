import type { GroupSummary } from "@language-app/core";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { errorMessage } from "../lib/toast";

/** The learner's groups (§9.5) as a screen holds them while they load. */
export type Groups =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; groups: GroupSummary[] };

/** Loads the learner's groups once; `reload` tries again. */
export function useGroups() {
  const [state, setState] = useState<Groups>({ kind: "loading" });

  const reload = useCallback(() => {
    setState({ kind: "loading" });
    api.listGroups().then(
      ({ groups }) => setState({ kind: "ready", groups }),
      (error) => setState({ kind: "error", message: errorMessage(error) }),
    );
  }, []);

  useEffect(reload, [reload]);

  return { state, reload };
}
