import type { ImportSummary } from "@language-app/core";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { errorMessage } from "../lib/toast";

/** The past imports (§9.2) as a screen holds them while they load. */
export type PastImports =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; imports: ImportSummary[] };

/** Loads the past imports once; `reload` tries again. */
export function usePastImports() {
  const [state, setState] = useState<PastImports>({ kind: "loading" });

  const reload = useCallback(() => {
    setState({ kind: "loading" });
    api.listImports().then(
      ({ imports }) => setState({ kind: "ready", imports }),
      (error) => setState({ kind: "error", message: errorMessage(error) }),
    );
  }, []);

  useEffect(reload, [reload]);

  return { state, reload };
}
