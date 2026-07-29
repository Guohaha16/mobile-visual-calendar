export type ImageLuminance = "dark" | "light";

const SAMPLE_SIZE = 24;
const DARK_THRESHOLD = 0.48;

export async function classifyImageLuminance(
  blob: Blob,
): Promise<ImageLuminance> {
  if (typeof globalThis.createImageBitmap !== "function") {
    return "light";
  }

  const bitmap = await globalThis.createImageBitmap(blob);
  try {
    const context = createSamplingContext();
    if (context === undefined) {
      return "light";
    }

    context.drawImage(bitmap, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const pixels = context.getImageData(
      0,
      0,
      SAMPLE_SIZE,
      SAMPLE_SIZE,
    ).data;
    let luminance = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index] ?? 255;
      const green = pixels[index + 1] ?? 255;
      const blue = pixels[index + 2] ?? 255;
      luminance +=
        (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
    }

    const average = luminance / (pixels.length / 4);
    return average < DARK_THRESHOLD ? "dark" : "light";
  } catch {
    return "light";
  } finally {
    bitmap.close();
  }
}

function createSamplingContext():
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D
  | undefined {
  if (typeof OffscreenCanvas === "function") {
    return (
      new OffscreenCanvas(SAMPLE_SIZE, SAMPLE_SIZE).getContext("2d", {
        willReadFrequently: true,
      }) ?? undefined
    );
  }

  if (typeof document === "undefined") {
    return undefined;
  }

  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  return (
    canvas.getContext("2d", {
      willReadFrequently: true,
    }) ?? undefined
  );
}
