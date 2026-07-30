import { afterEach, describe, expect, it, vi } from "vitest";

import { classifyImageLuminance } from "./luminance";

describe("classifyImageLuminance", () => {
  const originalCreateImageBitmap = globalThis.createImageBitmap;

  afterEach(() => {
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      value: originalCreateImageBitmap,
    });
  });

  it("falls back to a light treatment when bitmap decoding fails", async () => {
    Object.defineProperty(globalThis, "createImageBitmap", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error("unsupported image")),
    });

    await expect(
      classifyImageLuminance(new Blob(["broken"], { type: "image/heic" })),
    ).resolves.toBe("light");
  });
});
