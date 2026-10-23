import type { PDFDocumentProxy, PDFWorker } from "pdfjs-dist/legacy/build/pdf.mjs";
// The legacy build: the modern one calls Map.getOrInsertComputed and Math.sumPrecise, which
// Safari 18 lacks (checked on the author's iPhone, iOS 18.7.2).
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { pageLabels } from "../imports/pdfPages";
import { JPEG_QUALITY, MAX_SIDE } from "./shrinkImage";

/** An open PDF (§6.8). `labels` are the printed page numbers, null when the PDF has none. */
export type PdfDocument = {
  readonly pageCount: number;
  readonly labels: string[] | null;
  /** pdf.js's document; only this file uses it. */
  readonly proxy: PDFDocumentProxy;
};

export type PdfErrorKind = "invalid" | "password" | "reader" | "render";

const MESSAGES: Record<PdfErrorKind, string> = {
  invalid: "Couldn't open this PDF",
  password: "This PDF is password-protected",
  reader: "Couldn't start the PDF reader",
  render: "Couldn't render this page",
};

export class PdfError extends Error {
  constructor(readonly kind: PdfErrorKind) {
    super(MESSAGES[kind]);
    this.name = "PdfError";
  }
}

/** How long the worker may take to start before PDF pages says it couldn't. */
const WORKER_TIMEOUT_MS = 30_000;

type Reader = { pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs"); worker: PDFWorker };
let reader: Promise<Reader> | null = null;

/**
 * pdf.js and its worker, loaded on first use so the rest of the app doesn't carry them. The worker
 * is started here rather than by pdf.js, which would quietly run on the page, slowly, if the
 * worker failed: this way a failure shows. A web worker needs no secure context (§6.8).
 */
function startReader(): Promise<Reader> {
  reader ??= (async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const port = new Worker(workerUrl, { type: "module" });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => finish(new Error("The PDF worker didn't start")),
        WORKER_TIMEOUT_MS,
      );
      const onMessage = (event: MessageEvent) => {
        if ((event.data as { action?: unknown } | null)?.action === "ready") finish();
      };
      const onError = (event: ErrorEvent) => finish(new Error(event.message || "Worker error"));
      function finish(error?: Error) {
        clearTimeout(timer);
        port.removeEventListener("message", onMessage);
        port.removeEventListener("error", onError);
        if (error) {
          port.terminate();
          reject(error);
        } else resolve();
      }
      port.addEventListener("message", onMessage);
      port.addEventListener("error", onError);
    });
    // Errors only: a scanned book's OCR text layer names fonts it doesn't embed, and pdf.js would
    // warn about each one, although that layer is never seen.
    const verbosity = pdfjs.VerbosityLevel.ERRORS;
    // pdf.js types `port` as null in its JSDoc; a Worker is what it takes.
    return { pdfjs, worker: new pdfjs.PDFWorker({ port: port as unknown as null, verbosity }) };
  })().catch((error: unknown) => {
    reader = null;
    console.error(error);
    throw new PdfError("reader");
  });
  return reader;
}

/** Files pdf.js loads as it needs them, served by Vite (`web/vite.config.ts`). */
const resource = (folder: string) =>
  new URL(`${import.meta.env.BASE_URL}pdfjs/${folder}/`, location.href).href;

/**
 * Opens a PDF from the phone (§6.8). The whole file is read into memory, which Safari handles for
 * a 90 MB textbook. Rejects with a {@link PdfError}: not a PDF, password-protected, or the reader
 * couldn't start.
 *
 * Device-specific: a phone app replaces this file.
 */
export async function openPdf(file: Blob): Promise<PdfDocument> {
  const { pdfjs, worker } = await startReader();
  let data: Uint8Array;
  try {
    data = new Uint8Array(await file.arrayBuffer());
  } catch {
    throw new PdfError("invalid");
  }
  const task = pdfjs.getDocument({
    data,
    worker,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
    // Fonts a PDF doesn't embed, CMaps, and the JPEG 2000 / JBIG2 decoders scanned books need.
    cMapUrl: resource("cmaps"),
    cMapPacked: true,
    standardFontDataUrl: resource("standard_fonts"),
    wasmUrl: resource("wasm"),
    iccUrl: resource("iccs"),
  });
  try {
    const proxy = await task.promise;
    const labels = await proxy.getPageLabels().catch(() => null);
    return { pageCount: proxy.numPages, labels: pageLabels(labels, proxy.numPages), proxy };
  } catch (error) {
    await task.destroy().catch(() => {});
    throw new PdfError(
      (error as { name?: unknown } | null)?.name === "PasswordException" ? "password" : "invalid",
    );
  }
}

/** Frees an open PDF's memory; the worker stays for the next one. */
export function closePdf(doc: PdfDocument): void {
  void doc.proxy.loadingTask.destroy().catch(() => {});
}

const cancelled = () => new DOMException("Cancelled", "AbortError");

/**
 * Renders one page to a JPEG whose longest side is `maxSide` (1600 px for an upload, like a shrunk
 * photo, §6.2). One page at a time; the canvas is freed before it returns. A JPEG 2000 scan is slow
 * on Safari 18 (pdf.js's decoder needs a WebAssembly feature it lacks and falls back to plain
 * JavaScript): a page can take 3 s. Aborting `signal` cancels the drawing.
 *
 * Device-specific: a phone app replaces this file.
 */
export async function renderPage(
  doc: PdfDocument,
  pageNumber: number,
  { maxSide = MAX_SIDE, signal }: { maxSide?: number; signal?: AbortSignal } = {},
): Promise<Blob> {
  if (signal?.aborted) throw cancelled();
  const page = await doc.proxy.getPage(pageNumber);
  const canvas = document.createElement("canvas");
  try {
    const unscaled = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({
      scale: maxSide / Math.max(unscaled.width, unscaled.height),
    });
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const task = page.render({ canvas, viewport });
    const cancel = () => task.cancel();
    signal?.addEventListener("abort", cancel);
    try {
      await task.promise;
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new PdfError("render");
    return blob;
  } catch (error) {
    if (signal?.aborted) throw cancelled();
    if (error instanceof PdfError) throw error;
    console.error(error);
    throw new PdfError("render");
  } finally {
    // Free the canvas memory now rather than whenever the garbage collector runs (iOS).
    canvas.width = 0;
    canvas.height = 0;
    page.cleanup();
  }
}
