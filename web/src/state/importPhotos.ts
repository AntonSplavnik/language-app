// The photos of one import while they are prepared and read (§6.2, §10 Import). Photos live only
// in the browser's memory; the server keeps the words, not the images.

export type PhotoStatus =
  /** Picked, waiting to be shrunk. */
  | "queued"
  /** Being shrunk to a 1600 px JPEG. One photo at a time, to spare the phone's memory. */
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
  file: Blob;
  jpeg: Blob | null;
  previewUrl: string | null;
  status: PhotoStatus;
  wordsFound?: number;
  error?: { message: string; retryable: boolean };
};

export type PhotosState = { photos: Photo[] };

export type PhotoAction =
  | { type: "added"; photos: Array<{ id: string; file: Blob }> }
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

export function photosReducer(state: PhotosState, action: PhotoAction): PhotosState {
  const update = (id: string, change: (photo: Photo) => Photo) => ({
    photos: state.photos.map((p) => (p.id === id ? change(p) : p)),
  });

  switch (action.type) {
    case "added":
      return {
        photos: [
          ...state.photos,
          ...action.photos.map(
            ({ id, file }): Photo => ({
              id,
              file,
              jpeg: null,
              previewUrl: null,
              status: "queued",
            }),
          ),
        ],
      };
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
      return update(action.id, (p) =>
        p.status === "failed" ? { ...p, status: p.jpeg ? "ready" : "queued", error: undefined } : p,
      );
    case "removed":
      return { photos: state.photos.filter((p) => p.id !== action.id || !canRemove(p)) };
  }
}

/** The next photo to shrink, if none is being shrunk. */
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
