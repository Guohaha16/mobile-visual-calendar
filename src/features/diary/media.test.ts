import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createThumbnail,
  filterImageFiles,
  prepareDiaryImages,
} from "./media";

describe("diary media", () => {
  const close = vi.fn();

  beforeEach(() => {
    close.mockClear();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async (file: File) => ({
        close,
        height: file.name === "portrait.png" ? 1200 : 800,
        width: file.name === "portrait.png" ? 800 : 1200,
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("accepts only images and preserves multi-image order", async () => {
    const first = new File(["first"], "landscape.jpg", { type: "image/jpeg" });
    const ignored = new File(["notes"], "notes.txt", { type: "text/plain" });
    const second = new File(["second"], "portrait.png", { type: "image/png" });

    expect(filterImageFiles([first, ignored, second])).toEqual([first, second]);
    await expect(prepareDiaryImages([first, ignored, second])).resolves.toEqual([
      { file: first, height: 800, width: 1200 },
      { file: second, height: 1200, width: 800 },
    ]);
  });

  it("creates a 640-edge WebP thumbnail with original size metadata", async () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback, type, quality) => {
        expect(type).toBe("image/webp");
        expect(quality).toBe(0.82);
        callback(new Blob(["thumbnail"], { type: "image/webp" }));
      },
    );
    const file = new File(["image"], "landscape.jpg", { type: "image/jpeg" });

    const result = await createThumbnail(file);

    expect(result).toMatchObject({
      height: 800,
      thumbnailHeight: 427,
      thumbnailWidth: 640,
      width: 1200,
    });
    expect(result.thumbnailBlob.type).toBe("image/webp");
    expect(drawImage).toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
