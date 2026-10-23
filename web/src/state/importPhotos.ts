// The photos of one import while they are prepared and read (§6.2, §10 Import). Photos live only
// in the browser's memory; the server keeps the words, not the images. Pages of a PDF are tiles
// too (§6.8): rendered instead of shrunk, then read like photos.

import type { PdfPage } from "../imports/pdfPages";

export type PhotoStatus =
  /** Picked, waiting to be shrunk (a PDF page: rendered). */
  | "queued"
  /**
   * Being shrunk to a 1600 px JPEG (a PDF page: rendered to one). One at a time, to spare the
   * phone's memory.
   */
  | "preparing"
  /** Shrunk, waiting to be sent. */
  | "ready"
  /** Sent; the AI is reading it. At most two at a time. */
  | "reading"
  | "done"
  /** Read, but the AI couldn't read much of it. Its words are kept. */
  | "poor"
  | "failed";

export type Photo = {
  /** Local id, never sent to the server. */
  id: string;
  /** The picked photo; null for a PDF page. */
  file: Blob | null;
  /** The PDF page this tile shows; null for a photo. */
  page: PdfPage | null;
  jpeg: Blob | null;
  previewUrl: string | null;
  status: PhotoStatus;
  wordsFound?: number;
  error?: { message: string; retryable: boolean };
};

export type PhotosState = { photos: Photo[] };

/** A picked photo, or a page of a PDF. */
export type NewPhoto = { id: string; file: Blob } | { id: string; page: PdfPage };

export type PhotoAction =
  /** Ids already in the import are left alone, so the same pages can't arrive twice. */
  | { type: "added"; photos: NewPhoto[] }
  | { type: "preparing"; id: string }
  | { type: "prepared"; id: string; jpeg: Blob; previewUrl: string }
  | { type: "reading"; id: string }
  | { type: "read"; id: string; pageQuality: "ok" | "poor"; wordsFound: number }
  | { type: "failed"; id: string; message: string; retryable: boolean }
  | { type: "retry"; id: string }
  | { type: "removed"; id: string };

export const MAX_PARALLEL_READS = 2;

let lastPhotoId = 0;
/**
 * A local id for a picked photo. Not a Web Crypto UUID: the phone opens the app over plain
 * HTTP on the home network, which is not a secure context, so that API is missing there.
 */
export const newPhotoId = () => `photo-${++lastPhotoId}`;

export const initialPhotos: PhotosState = { photos: [] };

/** A photo can be removed before it is sent or after it failed; a read photo's words are kept. */
export const canRemove = (photo: Photo) =>
  photo.status === "queued" || photo.status === "ready" || photo.status === "failed";

/** A poor photo can be taken again; a rendered PDF page can't (§10 Import). */
export const canRetake = (photo: Photo) => photo.status === "poor" && photo.page === null;

export function photosReducer(state: PhotosState, action: PhotoAction): PhotosState {
  const update = (id: string, change: (photo: Photo) => Photo) => ({
    photos: state.photos.map((p) => (p.id === id ? change(p) : p)),
  });

  switch (action.type) {
    case "added": {
      const known = new Set(state.photos.map((p) => p.id));
      return {
        photos: [
          ...state.photos,
          ...action.photos
            .filter((photo) => !known.has(photo.id))
            .map(
              (photo): Photo => ({
                id: photo.id,
                file: "file" in photo ? photo.file : null,
                page: "page" in photo ? photo.page : null,
                jpeg: null,
                previewUrl: null,
                status: "queued",
              }),
            ),
        ],
      };
    }
    case "preparing":
      return update(action.id, (p) => ({ ...p, status: "preparing" }));
    case "prepared":
      return update(action.id, (p) => ({
        ...p,
        status: "ready",
        jpeg: action.jpeg,
        previewUrl: action.previewUrl,
      }));
    case "reading":
      return update(action.id, (p) => ({ ...p, status: "reading", error: undefined }));
    case "read":
      return update(action.id, (p) => ({
        ...p,
        status: action.pageQuality === "poor" ? "poor" : "done",
        wordsFound: action.wordsFound,
      }));
    case "failed":
      return update(action.id, (p) => ({
        ...p,
        status: "failed",
        error: { message: action.message, retryable: action.retryable },
      }));
    case "retry":
      // A photo is sent again as it was shrunk; a PDF page is rendered again (§10 Import).
      return update(action.id, (p) => {
        if (p.status !== "failed") return p;
        if (p.page) return { ...p, status: "queued", jpeg: null, error: undefined };
        return { ...p, status: p.jpeg ? "ready" : "queued", error: undefined };
      });
    case "removed":
      return { photos: state.photos.filter((p) => p.id !== action.id || !canRemove(p)) };
  }
}

/** The next photo to shrink or page to render, if none is being prepared. */
export function nextToPrepare(state: PhotosState): Photo | undefined {
  if (state.photos.some((p) => p.status === "preparing")) return undefined;
  return state.photos.find((p) => p.status === "queued");
}

/** The next photo to send, if fewer than {@link MAX_PARALLEL_READS} are being read. */
export function nextToRead(state: PhotosState): Photo | undefined {
  const reading = state.photos.filter((p) => p.status === "reading").length;
  if (reading >= MAX_PARALLEL_READS) return undefined;
  return state.photos.find((p) => p.status === "ready");
}

/** Some photo is still waiting, being shrunk or being read. */
export const isBusy = (state: PhotosState) =>
  state.photos.some((p) => ["queued", "preparing", "ready", "reading"].includes(p.status));

/**
 * Review can start once at least one photo has been read (in this visit or an earlier one,
 * `serverPhotoCount`) and nothing is in progress: starting review closes the import to photos.
 */
export const canReview = (state: PhotosState, serverPhotoCount: number) =>
  serverPhotoCount > 0 && !isBusy(state);
