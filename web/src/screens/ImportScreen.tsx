import { ApiClientError, type ImportView } from "@language-app/core";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { api } from "../api";
import { Page } from "../components/Page";
import { pickPhotos } from "../device/pickPhotos";
import { shrinkImage } from "../device/shrinkImage";
import { errorMessage, useToast } from "../lib/toast";
import {
  canRemove,
  canReview,
  initialPhotos,
  isBusy,
  newPhotoId,
  nextToPrepare,
  nextToRead,
  type Photo,
  photosReducer,
} from "../state/importPhotos";
import ui from "../styles/ui.module.css";
import styles from "./ImportScreen.module.css";

/** Errors worth retrying with the same photo; anything else needs another photo (§12 Import). */
const RETRYABLE = new Set(["ai_busy", "ai_invalid_output", "network", "internal", "http_error"]);

/**
 * Add photos (§10 Import). `/imports/new` until the first photo is sent, then `/imports/:id`; the
 * route stays the same, so the photos in memory survive the URL change.
 */
export function ImportScreen() {
  const { id: idParam } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [importId, setImportId] = useState<number | null>(
    idParam && idParam !== "new" ? Number(idParam) : null,
  );
  const [view, setView] = useState<ImportView | null>(null);
  const [name, setName] = useState("");
  const [state, dispatch] = useReducer(photosReducer, initialPhotos);
  const [startingReview, setStartingReview] = useState(false);

  // Resuming an import: closed ones go to review or Home.
  useEffect(() => {
    if (importId === null || view) return;
    api.getImport(importId).then(
      (loaded) => {
        if (loaded.status === "reviewing")
          navigate(`/imports/${loaded.id}/review`, { replace: true });
        else if (loaded.status === "done") navigate("/", { replace: true });
        else setView(loaded);
      },
      (error) => toast.show(errorMessage(error)),
    );
  }, [importId, view, navigate, toast]);

  // The import is created with the first photo, so an abandoned screen leaves nothing behind.
  const creating = useRef<Promise<number> | null>(null);
  const ensureImport = useCallback((): Promise<number> => {
    if (importId !== null) return Promise.resolve(importId);
    creating.current ??= api.createImport({ name: name.trim() || undefined }).then(
      (created) => {
        setImportId(created.id);
        setView(created);
        navigate(`/imports/${created.id}`, { replace: true });
        return created.id;
      },
      (error) => {
        creating.current = null;
        throw error;
      },
    );
    return creating.current;
  }, [importId, name, navigate]);

  // Shrink one photo at a time.
  useEffect(() => {
    const next = nextToPrepare(state);
    if (!next) return;
    dispatch({ type: "preparing", id: next.id });
    shrinkImage(next.file).then(
      (jpeg) =>
        dispatch({ type: "prepared", id: next.id, jpeg, previewUrl: URL.createObjectURL(jpeg) }),
      (error) =>
        dispatch({ type: "failed", id: next.id, message: errorMessage(error), retryable: false }),
    );
  }, [state]);

  // Send up to two photos at a time.
  useEffect(() => {
    const next = nextToRead(state);
    if (!next?.jpeg) return;
    const jpeg = next.jpeg;
    dispatch({ type: "reading", id: next.id });
    ensureImport()
      .then((id) => api.uploadPhoto(id, jpeg))
      .then(
        (result) => {
          dispatch({
            type: "read",
            id: next.id,
            pageQuality: result.pageQuality,
            wordsFound: result.wordsFound,
          });
          // Two uploads can finish in either order; keep the newer server state.
          setView((current) =>
            !current || result.import.photoCount >= current.photoCount ? result.import : current,
          );
        },
        (error) => {
          const code = error instanceof ApiClientError ? error.code : "unknown";
          dispatch({
            type: "failed",
            id: next.id,
            message: errorMessage(error),
            retryable: RETRYABLE.has(code) || code === "unknown",
          });
        },
      );
  }, [state, ensureImport]);

  // Release thumbnail memory when leaving the screen.
  const previews = useRef<string[]>([]);
  previews.current = state.photos.flatMap((p) => (p.previewUrl ? [p.previewUrl] : []));
  useEffect(
    () => () => {
      for (const url of previews.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const addPhotos = async () => {
    try {
      const files = await pickPhotos();
      if (files.length === 0) return;
      dispatch({ type: "added", photos: files.map((file) => ({ id: newPhotoId(), file })) });
    } catch (error) {
      toast.show(errorMessage(error));
    }
  };

  const serverPhotoCount = view?.photoCount ?? 0;
  const readThisVisit = state.photos.filter(
    (p) => p.status === "done" || p.status === "poor",
  ).length;
  const readEarlier = Math.max(0, serverPhotoCount - readThisVisit);
  const reviewReady = canReview(state, serverPhotoCount);

  const startReview = async () => {
    if (importId === null) return;
    setStartingReview(true);
    try {
      await api.startReview(importId);
      navigate(`/imports/${importId}/review`);
    } catch (error) {
      toast.show(errorMessage(error));
      setStartingReview(false);
    }
  };

  return (
    <Page
      title={view?.name ?? (importId === null ? "New import" : "Import")}
      back="/"
      footer={
        <>
          <button
            type="button"
            className={`${ui.button} ${ui.primary} ${ui.block}`}
            disabled={!reviewReady || startingReview}
            onClick={startReview}
          >
            {startingReview && <span className={ui.spinner} />}
            Review words
            {view && view.candidates.length > 0 ? ` (${view.candidates.length})` : ""}
          </button>
          {!reviewReady && (
            <p className={ui.hint}>
              {isBusy(state)
                ? "Wait until every photo is read"
                : "Add a photo of the pages you studied"}
            </p>
          )}
        </>
      }
    >
      {importId === null && (
        <label className={styles.name}>
          <span>Name (optional)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Lesson 4"
            maxLength={100}
            enterKeyHint="done"
          />
        </label>
      )}

      {readEarlier > 0 && (
        <p className={styles.note}>
          {readEarlier === 1 ? "1 photo" : `${readEarlier} photos`} read earlier; their words are
          kept.
        </p>
      )}

      {state.photos.length > 0 && (
        <ul className={styles.grid}>
          {state.photos.map((photo) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              onRetry={() => dispatch({ type: "retry", id: photo.id })}
              onRemove={() => dispatch({ type: "removed", id: photo.id })}
              onRetake={addPhotos}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        className={`${ui.button} ${ui.secondary} ${styles.add}`}
        onClick={addPhotos}
      >
        <span aria-hidden className={styles.plus}>
          +
        </span>
        {state.photos.length === 0 && serverPhotoCount === 0
          ? "Take or choose photos"
          : "Add more photos"}
      </button>
    </Page>
  );
}

function PhotoTile({
  photo,
  onRetry,
  onRemove,
  onRetake,
}: {
  photo: Photo;
  onRetry: () => void;
  onRemove: () => void;
  onRetake: () => void;
}) {
  return (
    <li className={`${styles.tile} ${styles[photo.status]}`}>
      <div className={styles.thumb}>
        {photo.previewUrl ? (
          <img src={photo.previewUrl} alt="" />
        ) : (
          <span className={styles.placeholder} />
        )}
        {canRemove(photo) && (
          <button
            type="button"
            className={styles.remove}
            onClick={onRemove}
            aria-label="Remove photo"
          >
            ×
          </button>
        )}
      </div>
      <div className={styles.status}>
        <PhotoStatus photo={photo} />
      </div>
      {photo.status === "failed" && photo.error?.retryable && (
        <button
          type="button"
          className={`${ui.button} ${ui.secondary} ${ui.small}`}
          onClick={onRetry}
        >
          Retry
        </button>
      )}
      {photo.status === "poor" && (
        <button
          type="button"
          className={`${ui.button} ${ui.secondary} ${ui.small}`}
          onClick={onRetake}
        >
          Retake
        </button>
      )}
    </li>
  );
}

function PhotoStatus({ photo }: { photo: Photo }) {
  switch (photo.status) {
    case "queued":
    case "ready":
      return <span>Waiting…</span>;
    case "preparing":
      return (
        <span className={styles.busy}>
          <span className={ui.spinner} /> Preparing
        </span>
      );
    case "reading":
      return (
        <span className={styles.busy}>
          <span className={ui.spinner} /> Reading
        </span>
      );
    case "done":
      return <span>✓ {photo.wordsFound} words</span>;
    case "poor":
      return <span>Couldn't read much from this page</span>;
    case "failed":
      return <span>{photo.error?.message}</span>;
  }
}
