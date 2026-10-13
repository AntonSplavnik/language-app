import type { WordView } from "@language-app/core";
import styles from "./Headword.module.css";

type HeadwordProps = {
  word: Pick<WordView, "lemma" | "pos" | "article">;
  className?: string;
};

/**
 * The headword as on the card back, "der Tisch", with a noun's article in its gender's colour
 * (§10): der blue, die red, das teal. Other words, and nouns without an article, show the lemma
 * alone. German text, so the browser hyphenates a long compound where it wraps.
 */
export function Headword({ word, className }: HeadwordProps) {
  const article = word.pos === "noun" ? word.article : null;
  return (
    <span lang="de" className={className}>
      {article && (
        <>
          <span className={`${styles.article} ${styles[article]}`}>{article}</span>{" "}
        </>
      )}
      {word.lemma}
    </span>
  );
}
