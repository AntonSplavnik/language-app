import {
  ApiClientError,
  type CardResult,
  type CardResultRequest,
  type SessionResponse,
} from "@language-app/core";
import { useDrag } from "@use-gesture/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { api } from "../api";
import { Page } from "../components/Page";
import { readJson, removeItem, writeJson } from "../lib/storage";
import { errorMessage, useToast } from "../lib/toast";
import { Card } from "../practice/Card";
import { createResultQueue } from "../practice/resultQueue";
import { decideSwipe, SWIPE_DISTANCE } from "../practice/swipe";
import ui from "../styles/ui.module.css";
import styles from "./FlashcardsScreen.module.css";

/** How long a card takes to slide out after an answer. */
const EXIT_MS = 260;

type Saved = { session: SessionResponse; index: number };

const EXIT_TRANSFORM: Record<CardResult, (x: number, y: number) => string> = {
  knew: (_, y) => `translate3d(130vw, ${y}px, 0) rotate(24deg)`,
  didnt_know: (_, y) => `translate3d(-130vw, ${y}px, 0) rotate(-24deg)`,
  skipped: (x) => `translate3d(${x}px, -130vh, 0)`,
};

const HINT: Record<CardResult, string> = {
  knew: "Knew",
  didnt_know: "Didn't know",
  skipped: "Skip",
};

/** Flashcards (§8.2–8.4). The session's cards survive a reload of this tab. */
export function FlashcardsScreen() {
  const sessionId = Number(useParams().id);
  const location = useLocation();
  const storageKey = `practice:${sessionId}`;

  const [saved] = useState<Saved | null>(() => {
    const fromStart = location.state as SessionResponse | null;
    if (fromStart?.id === sessionId) return { session: fromStart, index: 0 };
    return readJson<Saved>(storageKey, "session") ?? null;
  });

  if (!saved) return <Navigate to="/practice" replace />;
  return <Flashcards key={sessionId} saved={saved} storageKey={storageKey} />;
}

function Flashcards({ saved, storageKey }: { saved: Saved; storageKey: string }) {
  const { session } = saved;
  const navigate = useNavigate();
  const toast = useToast();

  const [index, setIndex] = useState(saved.index);
  const [flipped, setFlipped] = useState(false);
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [leaving, setLeaving] = useState<CardResult | null>(null);
  const [finishing, setFinishing] = useState<null | "saving" | "waiting" | "failed">(null);

  const shownAt = useRef(performance.now());
  const flipMs = useRef<number | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  // Answers are sent at once; failed ones wait and are retried (§8.4).
  const queue = useMemo(
    () =>
      createResultQueue(
        (result: CardResultRequest) => api.recordResult(session.id, result).then(() => undefined),
        {
          // A 4xx (e.g. the word was deleted meanwhile) will never succeed.
          isRetryable: (error) =>
            !(error instanceof ApiClientError && error.status !== null && error.status < 500),
          onDrop: (_, error) => toast.show(errorMessage(error)),
        },
      ),
    [session.id, toast],
  );
  useEffect(() => () => queue.dispose(), [queue]);

  useEffect(() => {
    writeJson(storageKey, { session, index } satisfies Saved, "session");
  }, [storageKey, session, index]);

  const card = session.cards[index];
  const busy = leaving !== null || finishing !== null;

  const finish = useCallback(async () => {
    setFinishing("saving");
    // Every answer must reach the server before the summary is computed.
    while (!(await queue.drain())) {
      if (!alive.current) return;
      setFinishing("waiting");
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    try {
      const summary = await api.finishSession(session.id);
      removeItem(storageKey, "session");
      navigate(`/practice/${session.id}/summary`, { replace: true, state: summary });
    } catch (error) {
      toast.show(errorMessage(error));
      setFinishing("failed");
    }
  }, [queue, session.id, storageKey, navigate, toast]);

  const flip = useCallback(() => {
    if (busy) return;
    if (flipMs.current === null) flipMs.current = Math.round(performance.now() - shownAt.current);
    setFlipped((current) => !current);
  }, [busy]);

  const answer = useCallback(
    (result: CardResult) => {
      if (!card || busy) return;
      queue.push({
        userWordId: card.userWordId,
        result,
        flipped: flipMs.current !== null,
        flipMs: flipMs.current,
        answerMs: Math.round(performance.now() - shownAt.current),
      });
      setLeaving(result);
      setTimeout(() => {
        if (index + 1 < session.cards.length) {
          shownAt.current = performance.now();
          flipMs.current = null;
          setFlipped(false);
          setDrag({ x: 0, y: 0, active: false });
          setLeaving(null);
          setIndex(index + 1);
        } else {
          void finish();
        }
      }, EXIT_MS);
    },
    [card, busy, queue, index, session.cards.length, finish],
  );

  // The card follows the finger; a long or quick enough swipe answers, otherwise it snaps back.
  const bind = useDrag(
    ({ active, tap, movement: [mx, my], velocity: [vx, vy], direction: [dirX, dirY] }) => {
      if (busy) return;
      if (tap) return flip();
      if (active) return setDrag({ x: mx, y: my, active: true });
      const decision = decideSwipe({ dx: mx, dy: my, vx: vx * dirX, vy: vy * dirY });
      setDrag({ x: decision ? mx : 0, y: decision ? my : 0, active: false });
      if (decision) answer(decision);
    },
    { filterTaps: true },
  );

  // iOS Safari uses a sideways swipe anywhere on the page for "go back". On this screen the card
  // owns every drag, so native touch movement is cancelled (the screen doesn't scroll); that stops
  // it. A swipe starting at the very screen edge is a system gesture no page can cancel, which is
  // why the card keeps clear of the edges. Taps still work: the card uses pointer events and the
  // buttons clicks.
  useEffect(() => {
    const onTouchMove = (event: TouchEvent) => event.preventDefault();
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => document.removeEventListener("touchmove", onTouchMove);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const actions: Record<string, () => void> = {
        " ": flip,
        ArrowRight: () => answer("knew"),
        ArrowLeft: () => answer("didnt_know"),
        ArrowUp: () => answer("skipped"),
      };
      const action = actions[event.key];
      if (!action) return;
      event.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip, answer]);

  if (finishing) {
    return (
      <Page title="Practice" back="/">
        <div className={styles.finishing}>
          {finishing === "failed" ? (
            <button type="button" className={`${ui.button} ${ui.primary}`} onClick={finish}>
              Try again
            </button>
          ) : (
            <>
              <span className={ui.spinner} />
              <p>
                {finishing === "waiting"
                  ? "No connection. Your answers are kept and will be sent when it's back…"
                  : "Saving your answers…"}
              </p>
            </>
          )}
        </div>
      </Page>
    );
  }

  if (!card) return <Navigate to="/practice" replace />;

  const dragHint = hintFor(drag.x, drag.y);
  const transform = leaving
    ? (EXIT_TRANSFORM[leaving] as (x: number, y: number) => string)(drag.x, drag.y)
    : `translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${drag.x / 18}deg)`;

  return (
    <Page
      title="Practice"
      back="/"
      footer={
        <div className={styles.buttons}>
          <button
            type="button"
            className={`${ui.button} ${styles.miss}`}
            disabled={busy}
            onClick={() => answer("didnt_know")}
            aria-label="Didn't know"
          >
            ✗
          </button>
          <button
            type="button"
            className={`${ui.button} ${ui.secondary}`}
            disabled={busy}
            onClick={() => answer("skipped")}
          >
            Skip
          </button>
          <button
            type="button"
            className={`${ui.button} ${styles.hit}`}
            disabled={busy}
            onClick={() => answer("knew")}
            aria-label="Knew it"
          >
            ✓
          </button>
        </div>
      }
    >
      <p className={styles.progress}>
        {index + 1} / {session.cards.length}
      </p>

      <div className={styles.stage}>
        <div
          {...bind()}
          key={card.userWordId}
          className={styles.draggable}
          style={{
            transform,
            transition: drag.active ? "none" : `transform ${EXIT_MS}ms ease-out`,
          }}
        >
          <Card card={card} flipped={flipped} />
          {dragHint && (
            <span
              className={`${styles.hint} ${styles[dragHint.result]}`}
              style={{ opacity: dragHint.strength }}
            >
              {HINT[dragHint.result]}
            </span>
          )}
        </div>
      </div>

      <p className={styles.help}>Tap to flip · swipe → knew · ← didn't know · ↑ skip</p>
    </Page>
  );
}

/** Which answer the current drag points to, and how close it is to counting. */
function hintFor(x: number, y: number): { result: CardResult; strength: number } | null {
  const horizontal = Math.abs(x) >= Math.abs(y);
  const distance = horizontal ? Math.abs(x) : -y;
  if (distance < 12) return null;
  const result: CardResult = horizontal ? (x > 0 ? "knew" : "didnt_know") : "skipped";
  return { result, strength: Math.min(1, distance / SWIPE_DISTANCE) };
}
