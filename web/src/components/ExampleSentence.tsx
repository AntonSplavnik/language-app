import {
  type HighlightSegment,
  type HighlightWord,
  highlightWord,
  type WordView,
} from "@language-app/core";
import styles from "./ExampleSentence.module.css";

type ExampleSentenceProps = {
  sentence: string;
  /** The word the sentence illustrates; a noun's article gives its bold word the gender colour. */
  word: HighlightWord & Pick<WordView, "article">;
  className?: string;
};

/**
 * An example sentence with the word it illustrates in bold and underlined, in a noun's gender
 * colour (§10 Word detail, §8.2 card back). Which words count is `highlightWord`'s rule.
 */
export function ExampleSentence({ sentence, word, className }: ExampleSentenceProps) {
  const article = word.pos === "noun" ? word.article : null;
  return (
    <p
      lang="de"
      className={`${styles.sentence} ${article ? styles[article] : ""} ${className ?? ""}`}
    >
      <Highlighted segments={highlightWord(sentence, word)} />
    </p>
  );
}

function Highlighted({ segments }: { segments: HighlightSegment[] }) {
  // Keyed by where each piece starts in the sentence.
  let start = 0;
  return segments.map((segment) => {
    const key = start;
    start += segment.text.length;
    return segment.bold ? (
      <strong key={key}>{segment.text}</strong>
    ) : (
      <span key={key}>{segment.text}</span>
    );
  });
}
