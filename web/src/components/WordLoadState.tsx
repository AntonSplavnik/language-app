import type { WordLoad } from "../words/useWord";
import { LoadState } from "./LoadState";

type WordLoadStateProps = {
  loading: WordLoad;
  /** Where "My words" goes when the word is gone. */
  listUrl: string;
  onRetry: () => void;
};

/** Word detail and Edit word until the word is there: loading, gone, or failed (§12 My words). */
export function WordLoadState({ loading, listUrl, onRetry }: WordLoadStateProps) {
  return (
    <LoadState
      loading={loading}
      missing={{ text: "This word is not in your list any more.", to: listUrl, label: "My words" }}
      onRetry={onRetry}
    />
  );
}
