export interface PreparedDiaryImage {
  file: File;
  height: number;
  width: number;
}

export interface DiaryThumbnail {
  height: number;
  thumbnailBlob: Blob;
  thumbnailHeight: number;
  thumbnailWidth: number;
  width: number;
}

const assertImageFile = (file: File): void => {
  if (!file.type.startsWith("image/")) {
    throw new TypeError(`Unsupported diary media type: ${file.type || "unknown"}`);
  }
};

export const filterImageFiles = (files: Iterable<File>): File[] =>
  Array.from(files).filter((file) => file.type.startsWith("image/"));

const decodeImage = async (file: File): Promise<ImageBitmap> => {
  assertImageFile(file);
  if (typeof createImageBitmap !== "function") {
    throw new Error("This browser cannot decode diary images");
  }
  return createImageBitmap(file);
};

export const prepareDiaryImages = async (
  files: Iterable<File>,
): Promise<PreparedDiaryImage[]> => {
  const prepared: PreparedDiaryImage[] = [];

  for (const file of filterImageFiles(files)) {
    const bitmap = await decodeImage(file);
    prepared.push({ file, height: bitmap.height, width: bitmap.width });
    bitmap.close();
  }

  return prepared;
};

const canvasToWebp = (
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) {
          reject(new Error("Unable to create diary image thumbnail"));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      quality,
    );
  });

export const createThumbnail = async (
  file: File,
  maxEdge = 640,
  quality = 0.82,
): Promise<DiaryThumbnail> => {
  if (!Number.isFinite(maxEdge) || maxEdge <= 0) {
    throw new RangeError("Thumbnail edge must be positive");
  }

  const bitmap = await decodeImage(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const thumbnailWidth = Math.max(1, Math.round(bitmap.width * scale));
    const thumbnailHeight = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = thumbnailWidth;
    canvas.height = thumbnailHeight;
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("Unable to prepare diary image thumbnail");
    }

    context.drawImage(bitmap, 0, 0, thumbnailWidth, thumbnailHeight);
    const thumbnailBlob = await canvasToWebp(canvas, quality);
    return {
      height: bitmap.height,
      thumbnailBlob,
      thumbnailHeight,
      thumbnailWidth,
      width: bitmap.width,
    };
  } finally {
    bitmap.close();
  }
};
