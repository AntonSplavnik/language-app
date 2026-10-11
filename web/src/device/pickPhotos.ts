/**
 * Opens the system photo picker; on iPhone it offers the camera or the photo library and works
 * over plain HTTP (§6.2). Call it directly from a tap handler: browsers only open pickers in
 * response to a user gesture. Resolves with no files when the learner cancels.
 *
 * Device-specific: a phone app replaces this file.
 */
export function pickPhotos(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.style.display = "none";

    const finish = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => finish(Array.from(input.files ?? [])), { once: true });
    input.addEventListener("cancel", () => finish([]), { once: true });

    // iOS Safari only opens a picker for an input that is in the document.
    document.body.append(input);
    input.click();
  });
}
