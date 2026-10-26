import { cardBack, cardFront, type PracticeCard } from "@language-app/core";
import { useSignedInUser } from "../auth/session";
import { ExampleSentence } from "../components/ExampleSentence";
import { Headword } from "../components/Headword";
import { RotateIcon } from "../components/icons";
import { SpeakerButton } from "../components/SpeakerButton";
import styles from "./Card.module.css";

/**
 * One flashcard (§8.2): translation on the front, the German word and its details on the back,
 * with a speaker button when Wiktionary has a recording. The face turned away is inert, so it
 * can't be tapped or focused.
 */
export function Card({ card, flipped }: { card: PracticeCard; flipped: boolean }) {
  const front = cardFront(card);
  // Without AI no details are pending: nothing could add them (§6.7).
  const back = cardBack(card, { aiEnabled: useSignedInUser().aiEnabled });

  return (
    <div className={`${styles.card} ${flipped ? styles.flipped : ""}`}>
      <div className={`${styles.face} ${styles.front}`} aria-hidden={flipped} inert={flipped}>
        <p className={styles.translation}>{front.translation}</p>
        <p className={styles.pos}>{front.pos}</p>
        <p className={styles.flipHint}>
          <RotateIcon size={16} />
          Tap to flip
        </p>
      </div>

      <div className={`${styles.face} ${styles.back}`} aria-hidden={!flipped} inert={!flipped}>
        <div className={styles.word}>
          <div className={styles.headwordRow}>
            <p className={styles.headword}>
              <Headword word={card} />
            </p>
            {back.audioUrl && <SpeakerButton url={back.audioUrl} word={back.headword} />}
          </div>
          {back.forms && (
            <p className={styles.forms} lang="de">
              {back.forms}
            </p>
          )}
        </div>
        {back.example && (
          <>
            <span className={styles.divider} aria-hidden="true" />
            <div className={styles.example}>
              <ExampleSentence sentence={back.example.de} word={card} />
              {back.example.translation && (
                <p className={styles.exampleTranslation}>{back.example.translation}</p>
              )}
            </div>
          </>
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
