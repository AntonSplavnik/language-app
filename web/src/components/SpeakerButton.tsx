import { useEffect, useRef, useState } from "react";
import { playAudio, stopAudio } from "../device/playAudio";
import { errorMessage, useToast } from "../lib/toast";
import styles from "./SpeakerButton.module.css";

type SpeakerButtonProps = {
  /** The recording (MP3 on upload.wikimedia.org). */
  url: string;
  /** What is said, for the accessible label: "der Tisch". */
  word: string;
  className?: string;
};

/**
 * Plays a word's recording on tap, never by itself (§8.2, §10 Word detail). Tapping again while
 * it plays starts it over; leaving the card or the screen stops it.
 */
export function SpeakerButton({ url, word, className }: SpeakerButtonProps) {
  const toast = useToast();
  const [playing, setPlaying] = useState(false);
  // Which tap is the latest, so an earlier, interrupted one doesn't end the playing state.
  const latest = useRef(0);
  const active = useRef(false);

  useEffect(
    () => () => {
      if (active.current) stopAudio();
    },
    [],
  );

  const play = () => {
    const tap = ++latest.current;
    active.current = true;
    setPlaying(true);
    // Started right here in the tap handler: iOS Safari only plays sound started by a gesture.
    playAudio(url)
      .catch((error: unknown) => toast.show(errorMessage(error)))
      .finally(() => {
        if (tap !== latest.current) return;
        active.current = false;
        setPlaying(false);
      });
  };

  return (
    <button
      type="button"
      className={`${styles.speaker} ${playing ? styles.playing : ""} ${className ?? ""}`}
      aria-label={`Listen to “${word}”`}
      onClick={play}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 9.25v5.5h3.75l5.25 4.25V5L7.25 9.25z" fill="currentColor" />
        <path className={styles.wave} d="M15.75 9a4.25 4.25 0 0 1 0 6" />
        <path className={`${styles.wave} ${styles.outer}`} d="M18.25 6.5a8 8 0 0 1 0 11" />
      </svg>
    </button>
  );
}
