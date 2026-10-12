import { cardBack, cardFront, type PracticeCard } from "@language-app/core";
import { SpeakerButton } from "../components/SpeakerButton";
import styles from "./Card.module.css";

/**
 * One flashcard (§8.2): translation on the front, the German word and its details on the back,
 * with a speaker button when Wiktionary has a recording. The face turned away is inert, so it
 * can't be tapped or focused.
 */
export function Card({ card, flipped }: { card: PracticeCard; flipped: boolean }) {
  const front = cardFront(card);
  const back = cardBack(card);

  return (
    <div className={`${styles.card} ${flipped ? styles.flipped : ""}`}>
      <div className={`${styles.face} ${styles.front}`} aria-hidden={flipped} inert={flipped}>
        <p className={styles.translation}>{front.translation}</p>
        <p className={styles.pos}>{front.pos}</p>
      </div>

      <div className={`${styles.face} ${styles.back}`} aria-hidden={!flipped} inert={!flipped}>
        <div className={styles.headwordRow}>
          <p className={styles.headword}>{back.headword}</p>
          {back.audioUrl && <SpeakerButton url={back.audioUrl} word={back.headword} />}
        </div>
        {back.forms && <p className={styles.forms}>{back.forms}</p>}
        {back.example && (
          <div className={styles.example}>
            <p lang="de">{back.example.de}</p>
            {back.example.translation && <p className={styles.muted}>{back.example.translation}</p>}
          </div>
        )}
        {back.note && <p className={styles.note}>{back.note}</p>}
        {back.detailsPending && <p className={styles.pending}>Details pending</p>}
      </div>
    </div>
  );
}

/** Whether a pointer event started on a control inside the card (the speaker), not the card. */
export function isCardControl(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button") !== null;
}
