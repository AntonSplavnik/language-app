import { fitWithin } from "./fitWithin";

/** Upload size from §6.2: JPEG, longest side 1600 px, quality 0.85. */
export const MAX_SIDE = 1600;
export const JPEG_QUALITY = 0.85;

export class ImageDecodeError extends Error {
  constructor() {
    super("Couldn't open this image");
    this.name = "ImageDecodeError";
  }
}

type Decoded = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

/**
 * Shrinks a photo to the upload size (§6.2). Decodes one image at a time; call it sequentially,
 * phones run out of memory with several full-size photos open at once.
 *
 * Device-specific: a phone app replaces this file.
 */
export async function shrinkImage(file: Blob): Promise<Blob> {
  const image = await decode(file);
  try {
    const { width, height } = fitWithin(image.width, image.height, MAX_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new ImageDecodeError();
    context.drawImage(image.source, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    // Free the canvas memory now rather than whenever the garbage collector runs (iOS).
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) throw new ImageDecodeError();
    return blob;
  } finally {
    image.release();
  }
}

async function decode(file: Blob): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  } catch {
    // An <img> decodes some formats createImageBitmap won't (HEIC in Safari) and applies the
    // EXIF orientation too.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return {
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      };
    } catch {
      URL.revokeObjectURL(url);
      throw new ImageDecodeError();
    }
  }
}
