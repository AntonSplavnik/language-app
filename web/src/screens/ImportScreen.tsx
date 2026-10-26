import { ApiClientError, IMPORT_NAME_MAX, type ImportView } from "@language-app/core";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { api } from "../api";
import { useSignedInUser } from "../auth/session";
import { DropZone } from "../components/DropZone";
import { CameraIcon, CheckIcon, ChevronRightIcon, CloseIcon, PlusIcon } from "../components/icons";
import { Page } from "../components/Page";
import { bookStore } from "../device/bookStore";
import { PdfError, renderPage } from "../device/pdf";
import { pickPhotos } from "../device/pickPhotos";
import { shrinkImage } from "../device/shrinkImage";
import { handedOver } from "../imports/pdfImport";
import { isRetryable } from "../imports/photoErrors";
import { errorMessage, useToast } from "../lib/toast";
import {
  canRemove,
  canRetake,
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

/**
 * Add photos (§10 Import). `/imports/new` until the first photo is sent, then `/imports/:id`; the
 * route stays the same, so the photos in memory survive the URL change. Pages of a PDF arrive from
 * PDF pages (screen 16) in the navigation's state, as tiles that are rendered instead of shrunk.
 */
export function ImportScreen() {
  const { id: idParam } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const location = useLocation();
  const { aiEnabled } = useSignedInUser();
  // Only in memory: after a reload a PDF import resumes like any other (its pages read so far).
  const [pdf] = useState(() =>
    handedOver((location.state as { pdfImport?: unknown } | null)?.pdfImport),
  );

  const [importId, setImportId] = useState<number | null>(
    idParam && idParam !== "new" ? Number(idParam) : null,
  );
  const [view, setView] = useState<ImportView | null>(null);
  const [name, setName] = useState("");
  const [state, dispatch] = useReducer(photosReducer, initialPhotos);
  const [startingReview, setStartingReview] = useState(false);
  const isPdf = pdf !== null || view?.source === "pdf";

  // The pages from PDF pages become tiles; their ids make adding them twice a no-op.
  useEffect(() => {
    if (!pdf || importId !== null) return;
    dispatch({
      type: "added",
      photos: pdf.pages.map((page) => ({ id: `pdf-${pdf.id}-${page.number}`, page })),
    });
  }, [pdf, importId]);

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
    const body = pdf
      ? { name: pdf.name, source: "pdf" as const }
      : { name: name.trim() || undefined };
    creating.current ??= api.createImport(body).then(
      (created) => {
        setImportId(created.id);
        setView(created);
        navigate(`/imports/${created.id}`, { replace: true });
        if (pdf) {
          // The next PDF import suggests the pages after these (§6.8).
          const first = pdf.pages[0]?.number ?? 1;
          const range = { from: first, to: pdf.pages.at(-1)?.number ?? first };
          pdf.book.lastRange = range;
          void bookStore.setLastRange(pdf.book, range);
        }
        return created.id;
      },
      (error) => {
        creating.current = null;
        throw error;
      },
    );
    return creating.current;
  }, [importId, name, navigate, pdf]);

  // Shrink one photo, or render one PDF page, at a time.
  useEffect(() => {
    const next = nextToPrepare(state);
    if (!next) return;
    dispatch({ type: "preparing", id: next.id });
    const prepared = next.page
      ? pdf
        ? renderPage(pdf.book.doc, next.page.number)
        : Promise.reject(new PdfError("render"))
      : next.file
        ? shrinkImage(next.file)
        : Promise.reject(new Error("Couldn't open this image"));
    prepared.then(
      (jpeg) => {
        // A page rendered again replaces its earlier image.
        if (next.previewUrl) URL.revokeObjectURL(next.previewUrl);
        dispatch({ type: "prepared", id: next.id, jpeg, previewUrl: URL.createObjectURL(jpeg) });
      },
      (error) =>
        dispatch({
          type: "failed",
          id: next.id,
          message: errorMessage(error),
          // A page can be rendered again; a photo the browser can't open can't.
          retryable: next.page !== null,
        }),
    );
  }, [state, pdf]);

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
            retryable: isRetryable(code) || code === "unknown",
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

  const nothingYet = state.photos.length === 0 && serverPhotoCount === 0 && !pdf;
  const unit = isPdf ? "page" : "photo";

  return (
    <Page
      largeTitle={view?.name ?? pdf?.name ?? (importId === null ? "New import" : "Import")}
      back="/"
      footer={
        <>
          <button
            type="button"
            className={`${ui.button} ${ui.primary} ${ui.cta}`}
            disabled={!reviewReady || startingReview}
            onClick={startReview}
          >
            {startingReview && <span className={ui.spinner} />}
            Review words
            {view && view.candidates.length > 0 && (
              <span className={styles.count}>{view.candidates.length}</span>
            )}
          </button>
          {!reviewReady && (isBusy(state) || !isPdf) && (
            <p className={ui.hint}>
              {isBusy(state)
                ? `Wait until every ${unit} is read`
                : "Add a photo of the pages you studied"}
            </p>
          )}
        </>
      }
    >
      {readEarlier > 0 && (
        <p className={styles.note}>
          <CheckIcon size={16} />
          <span>
            {readEarlier === 1 ? `1 ${unit}` : `${readEarlier} ${unit}s`} read earlier; their words
            are kept.
          </span>
        </p>
      )}

      {importId === null && !pdf && (
        <label className={`${ui.field} ${styles.name}`}>
          <span className={ui.fieldLabel}>
            Name <span className={ui.optional}>(optional)</span>
          </span>
          <input
            className={ui.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Lesson 4"
            maxLength={IMPORT_NAME_MAX}
            enterKeyHint="done"
          />
        </label>
      )}

      {nothingYet ? (
        <>
          <DropZone
            icon={<CameraIcon size={32} />}
            title="Take or choose photos"
            hint="Photograph the pages you studied"
            onClick={addPhotos}
          />
          {/* Pages of a PDF (§6.8) or words typed by hand (§6.7) instead. */}
          <nav className={styles.others} aria-label="Other ways to add words">
            <Link to="/imports/new/pdf" className={`${ui.button} ${ui.quiet} ${styles.other}`}>
              or choose PDF pages
              <ChevronRightIcon size={16} />
            </Link>
            <Link to="/words/new" className={`${ui.button} ${ui.quiet} ${styles.other}`}>
              or type words
              <ChevronRightIcon size={16} />
            </Link>
          </nav>
        </>
      ) : (
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
          {/* A PDF import is the pages chosen; more pages are another import. Without AI (an
              import begun before it was switched off) the photos read so far can be reviewed. */}
          {!isPdf && aiEnabled && (
            <li className={styles.addCell}>
              <button type="button" className={styles.add} onClick={addPhotos}>
                <span className={styles.addIcon}>
                  <PlusIcon size={22} weight={2.2} />
                </span>
                Add more photos
              </button>
            </li>
          )}
        </ul>
      )}
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
    <li className={`${ui.card} ${styles.tile} ${styles[photo.status]}`}>
      <div className={styles.thumb}>
        {photo.previewUrl ? (
          <img src={photo.previewUrl} alt="" />
        ) : (
          <span className={`${styles.placeholder} ${ui.shimmer}`} />
        )}
        {photo.page && <span className={styles.pageLabel}>p. {photo.page.label}</span>}
        {canRemove(photo) && (
          <button
            type="button"
            className={styles.remove}
            onClick={onRemove}
            aria-label={photo.page ? `Remove page ${photo.page.label}` : "Remove photo"}
          >
            <CloseIcon size={14} weight={2.6} />
          </button>
        )}
      </div>
      <div className={styles.below}>
        <p className={styles.status}>
          <PhotoStatus photo={photo} />
        </p>
        {photo.status === "failed" && photo.error?.retryable && (
          <button type="button" className={styles.again} onClick={onRetry}>
            Retry
          </button>
        )}
        {canRetake(photo) && (
          <button type="button" className={styles.again} onClick={onRetake}>
            Retake
          </button>
        )}
      </div>
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
        <>
          <span className={ui.spinner} /> Preparing
        </>
      );
    case "reading":
      return (
        <>
          <span className={ui.spinner} /> Reading
        </>
      );
    case "done":
      return (
        <>
          <CheckIcon size={16} weight={2.6} />
          {photo.wordsFound} words
        </>
      );
    case "poor":
      return <span>Couldn't read much from this page</span>;
    case "failed":
      return <span>{photo.error?.message}</span>;
  }
}
