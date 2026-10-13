import { ApiClientError, type WordDetail } from "@language-app/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { errorMessage } from "../lib/toast";

/** Why a word isn't on screen yet. */
export type WordLoad =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "failed"; message: string };

/** Loads one of the learner's words, for Word detail and Edit word (§10). */
export function useWord(id: number) {
  const [word, setWord] = useState<WordDetail | null>(null);
  const [loading, setLoading] = useState<WordLoad>({ kind: "loading" });
  const latestRequest = useRef(0);

  const load = useCallback(() => {
    const request = ++latestRequest.current;
    setLoading({ kind: "loading" });
    api.getWord(id).then(
      (loaded) => request === latestRequest.current && setWord(loaded),
      (error) => {
        if (request !== latestRequest.current) return;
        // Deleted meanwhile, or a mistyped URL.
        const gone =
          error instanceof ApiClientError && (error.status === 404 || error.status === 400);
        setLoading(gone ? { kind: "missing" } : { kind: "failed", message: errorMessage(error) });
      },
    );
  }, [id]);

  useEffect(load, [load]);

  return { word, setWord, loading, load };
}
