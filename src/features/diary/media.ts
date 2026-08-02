export interface PreparedDiaryImage {
  file: File;
  height: number;
  width: number;
}

export interface DiaryThumbnail {
  height?: number;
  thumbnailBlob: Blob;
  thumbnailHeight?: number;
  thumbnailWidth?: number;
  width?: number;
}

interface DecodedImage {
  dispose: () => void;
  height: number;
  source: CanvasImageSource;
  width: number;
}

export const createMediaObjectUrl = (blob: Blob): string | undefined => {
  if (typeof URL.createObjectURL !== "function") {
    return undefined;
  }

  try {
    return URL.createObjectURL(blob);
  } catch {
    return undefined;
  }
};

const assertImageFile = (file: File): void => {
  if (!file.type.startsWith("image/")) {
    throw new TypeError(`Unsupported diary media type: ${file.type || "unknown"}`);
  }
};

export const filterImageFiles = (files: Iterable<File>): File[] =>
  Array.from(files).filter((file) => file.type.startsWith("image/"));

const decodeWithImageElement = (file: File): Promise<DecodedImage> =>
  new Promise((resolve, reject) => {
    if (
      typeof Image !== "function" ||
      typeof URL.createObjectURL !== "function"
    ) {
      reject(new Error("This browser cannot decode diary images"));
      return;
    }

    let url: string;
    try {
      url = URL.createObjectURL(file);
    } catch (error) {
      reject(error);
      return;
    }

    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (width <= 0 || height <= 0) {
        URL.revokeObjectURL(url);
        reject(new Error("The selected diary image has no visible dimensions"));
        return;
      }
      resolve({
        dispose: () => {
          URL.revokeObjectURL(url);
          image.removeAttribute("src");
        },
        height,
        source: image,
        width,
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser cannot decode the selected diary image"));
    };
    image.src = url;
  });

const decodeImage = async (file: File): Promise<DecodedImage> => {
  assertImageFile(file);
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width > 0 && bitmap.height > 0) {
        return {
          dispose: () => {
            bitmap.close();
          },
          height: bitmap.height,
          source: bitmap,
          width: bitmap.width,
        };
      }
      bitmap.close();
    } catch {
      // Older mobile browsers use the image-element decoder below.
    }
  }

  return decodeWithImageElement(file);
};

export const prepareDiaryImages = async (
  files: Iterable<File>,
): Promise<PreparedDiaryImage[]> => {
  const prepared: PreparedDiaryImage[] = [];

  for (const file of filterImageFiles(files)) {
    const image = await decodeImage(file);
    prepared.push({ file, height: image.height, width: image.width });
    image.dispose();
  }

  return prepared;
};

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | undefined> =>
  new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob ?? undefined), type, quality);
    } catch {
      resolve(undefined);
    }
  });

const originalImageFallback = (
  file: File,
  image?: Pick<DecodedImage, "height" | "width">,
): DiaryThumbnail => ({
  ...(image === undefined
    ? {}
    : {
        height: image.height,
        thumbnailHeight: image.height,
        thumbnailWidth: image.width,
        width: image.width,
      }),
  thumbnailBlob: file,
});

export const createThumbnail = async (
  file: File,
  maxEdge = 640,
  quality = 0.82,
): Promise<DiaryThumbnail> => {
  if (!Number.isFinite(maxEdge) || maxEdge <= 0) {
    throw new RangeError("Thumbnail edge must be positive");
  }

  let image: DecodedImage;
  try {
    image = await decodeImage(file);
  } catch {
    return originalImageFallback(file);
  }

  try {
    const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
    const thumbnailWidth = Math.max(1, Math.round(image.width * scale));
    const thumbnailHeight = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = thumbnailWidth;
    canvas.height = thumbnailHeight;
    const context = canvas.getContext("2d");
    if (context === null) {
      return originalImageFallback(file, image);
    }

    context.drawImage(image.source, 0, 0, thumbnailWidth, thumbnailHeight);
    const thumbnailBlob =
      (await canvasToBlob(canvas, "image/webp", quality)) ??
      (await canvasToBlob(canvas, "image/jpeg", quality));
    if (thumbnailBlob === undefined) {
      return originalImageFallback(file, image);
    }
    return {
      height: image.height,
      thumbnailBlob,
      thumbnailHeight,
      thumbnailWidth,
      width: image.width,
    };
  } finally {
    image.dispose();
  }
};
