import { IMPORT_NAME_MAX } from "@language-app/core";
import { useEffect, useReducer, useState } from "react";
import { useNavigate } from "react-router";
import { DropZone } from "../components/DropZone";
import { DocumentIcon } from "../components/icons";
import { Page } from "../components/Page";
import { bookStore } from "../device/bookStore";
import { openPdf, type PdfDocument, PdfError, renderPage } from "../device/pdf";
import { pickPdf } from "../device/pickPhotos";
import { currentBook, handOver, type OpenBook, setCurrentBook } from "../imports/pdfImport";
import {
  autoName,
  checkRange,
  type PdfPage,
  pagesText,
  rangeFields,
  suggestRange,
} from "../imports/pdfPages";
import { ThumbnailQueue } from "../imports/thumbnails";
import { errorMessage } from "../lib/toast";
import ui from "../styles/ui.module.css";
import styles from "./PdfPagesScreen.module.css";

/** Thumbnails are drawn once the fields have stopped changing for this long. */
const PREVIEW_DELAY_MS = 400;
/** A thumbnail's longest side: sharp at 132 px high on a 3× screen. */
const THUMB_SIDE = 400;

type BookState =
  /** Looking for a remembered book. */
  | { kind: "checking" }
  | { kind: "none" }
  | { kind: "opening"; name: string }
  | { kind: "open"; book: OpenBook };

/** From and To as typed; `near` picks among pages with the same printed number. */
type Fields = { from: string; to: string; near: number };

const fieldsFor = (book: OpenBook): Fields => {
  const range = suggestRange(book.doc, book.lastRange);
  return { ...rangeFields(book.doc, range), near: range.from };
};

/** Choose a PDF and the pages to import from it (§10 screen 16). */
export function PdfPagesScreen() {
  const navigate = useNavigate();
  const [state, setState] = useState<BookState>(() => {
    const open = currentBook();
    return open ? { kind: "open", book: open } : { kind: "checking" };
  });
  const [fields, setFields] = useState<Fields>(() => {
    const open = currentBook();
    return open ? fieldsFor(open) : { from: "", to: "", near: 1 };
  });
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  // The remembered book (§6.8), when none is open in this tab yet. One that can't be read any
  // more is forgotten, and a PDF is asked for again (§12 Import); when the reader itself didn't
  // start, the book is kept for the next visit and the error shows. Once, as the screen opens.
  useEffect(() => {
    if (currentBook()) return;
    let active = true;
    (async () => {
      const stored = await bookStore.load();
      if (!active) return;
      if (!stored) {
        setState({ kind: "none" });
        return;
      }
      setState({ kind: "opening", name: stored.name });
      try {
        const doc = await openPdf(stored.file);
        const { name, size, lastRange } = stored;
        const book: OpenBook = { name, size, doc, lastRange };
        // Kept even if the learner has left meanwhile, so coming back needn't open it again.
        setCurrentBook(book);
        if (!active) return;
        setState({ kind: "open", book });
        setFields(fieldsFor(book));
      } catch (failure) {
        const readerFailed = failure instanceof PdfError && failure.kind === "reader";
        if (!readerFailed) await bookStore.forget();
        if (!active) return;
        setState({ kind: "none" });
        if (readerFailed) setError(failure.message);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const choose = async () => {
    setError(null);
    const file = await pickPdf();
    if (!file) return;
    const before = state;
    setState({ kind: "opening", name: file.name });
    try {
      const doc = await openPdf(file);
      // The same PDF chosen again keeps its place.
      const previous = currentBook();
      const same = previous?.name === file.name && previous.size === file.size;
      const book: OpenBook = {
        name: file.name,
        size: file.size,
        doc,
        lastRange: same ? previous.lastRange : null,
      };
      setCurrentBook(book);
      setState({ kind: "open", book });
      setFields(fieldsFor(book));
      // Not remembered when the browser won't store it; the import works anyway (§12 Import).
      void bookStore.remember(file, book.lastRange);
    } catch (failure) {
      // The remembered book is not replaced.
      setState(before);
      setError(errorMessage(failure));
    }
  };

  const book = state.kind === "open" ? state.book : null;
  const check = book ? checkRange(book.doc, fields.from, fields.to, fields.near) : null;
  const pages = check?.ok ? check.pages : [];
  const automatic = autoName(pages);

  const start = () => {
    if (!book || pages.length === 0) return;
    const id = handOver(book, pages, name.trim() || automatic);
    navigate("/imports/new", { state: { pdfImport: id } });
  };

  return (
    <Page
      largeTitle="PDF pages"
      back="/imports/new"
      footer={
        <button
          type="button"
          className={`${ui.button} ${ui.primary} ${ui.cta}`}
          disabled={pages.length === 0}
          onClick={start}
        >
          {pages.length > 0 ? `Import ${pagesText(pages.length)}` : "Import pages"}
        </button>
      }
    >
      {state.kind === "none" && (
        <DropZone
          icon={<DocumentIcon size={32} />}
          title="Choose a PDF"
          hint="From Files or iCloud"
          onClick={choose}
        />
      )}
      {state.kind === "opening" && (
        <div className={`${ui.card} ${styles.book}`} aria-live="polite">
          <span className={styles.bookIcon}>
            <span className={ui.spinner} />
          </span>
          <span className={styles.bookText}>
            <span className={styles.bookName}>Opening…</span>
            <span className={styles.bookPages}>{state.name}</span>
          </span>
        </div>
      )}
      {book && (
        <>
          <div className={`${ui.card} ${styles.book}`}>
            <span className={styles.bookIcon}>
              <DocumentIcon size={24} />
            </span>
            <span className={styles.bookText}>
              <span className={styles.bookName}>{book.name}</span>
              <span className={styles.bookPages}>{pagesText(book.doc.pageCount)}</span>
            </span>
          </div>
          <button
            type="button"
            className={`${ui.button} ${ui.quiet} ${styles.another}`}
            onClick={choose}
          >
            Choose another PDF
          </button>
        </>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {book && check && (
        <>
          <Range
            fields={fields}
            onChange={setFields}
            note={check.ok ? pagesText(check.pages.length) : check.reason}
            invalid={!check.ok}
            printed={book.doc.labels !== null}
          />
          <Preview doc={book.doc} pages={pages} />
          <label className={ui.field}>
            <span className={ui.fieldLabel}>
              Name <span className={ui.optional}>(optional)</span>
            </span>
            <input
              className={ui.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={automatic || "e.g. Lesson 4"}
              maxLength={IMPORT_NAME_MAX}
              enterKeyHint="done"
            />
          </label>
        </>
      )}
    </Page>
  );
}

/** From and To, side by side, with the number of pages or why they can't be imported. */
function Range({
  fields,
  onChange,
  note,
  invalid,
  printed,
}: {
  fields: Fields;
  onChange: (fields: Fields) => void;
  note: string;
  invalid: boolean;
  /** The PDF has page labels, so the fields take the printed numbers. */
  printed: boolean;
}) {
  const field = (key: "from" | "to", label: string) => (
    <label className={ui.field}>
      <span className={ui.fieldLabel}>{label}</span>
      <input
        className={ui.input}
        value={fields[key]}
        onChange={(e) => onChange({ ...fields, [key]: e.target.value })}
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint={key === "from" ? "next" : "done"}
      />
    </label>
  );
  return (
    <div className={styles.range}>
      <div className={styles.fields}>
        {field("from", "From")}
        {field("to", "To")}
      </div>
      <p className={`${styles.note} ${invalid ? styles.invalid : ""}`} aria-live="polite">
        {note}
      </p>
      {!printed && (
        <p className={styles.hint}>Page numbers of the PDF file, not the printed ones</p>
      )}
    </div>
  );
}

/**
 * Thumbnails of the chosen pages, drawn one at a time after the fields stop changing (a scanned
 * page can take a second or more on the phone); a page no longer chosen stops being drawn.
 */
function Preview({ doc, pages }: { doc: PdfDocument; pages: PdfPage[] }) {
  const [queue, setQueue] = useState<ThumbnailQueue | null>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const created = new ThumbnailQueue(
      async (page, signal) =>
        URL.createObjectURL(await renderPage(doc, page, { maxSide: THUMB_SIDE, signal })),
      redraw,
      (url) => URL.revokeObjectURL(url),
    );
    setQueue(created);
    return () => created.close();
  }, [doc]);

  const wanted = pages.map((p) => p.number).join(",");
  useEffect(() => {
    if (!queue) return;
    const timer = setTimeout(
      () => queue.want(wanted ? wanted.split(",").map(Number) : []),
      PREVIEW_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [queue, wanted]);

  if (pages.length === 0) return null;
  return (
    <ul className={styles.preview} aria-label="Preview of the pages">
      {pages.map((page) => {
        const url = queue?.url(page.number);
        return (
          <li key={page.number} className={styles.thumb}>
            {url ? (
              <img src={url} alt="" />
            ) : (
              <span
                className={`${styles.blank} ${queue?.failedToDraw(page.number) ? "" : ui.shimmer}`}
              />
            )}
            <span className={styles.thumbLabel}>{page.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
