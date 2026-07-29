import { describe, expect, it } from "vitest";
import type { MediaAsset } from "./types";
import { resolveBackground } from "./background";

const assets: MediaAsset[] = [
  {
    id: "asset-1",
    entryId: "entry-1",
    userId: "user-1",
    mimeType: "image/jpeg",
    sortOrder: 0,
    createdAt: "2026-07-01T12:00:00.000Z",
  },
  {
    id: "asset-2",
    entryId: "entry-2",
    userId: "user-1",
    mimeType: "image/png",
    sortOrder: 0,
    createdAt: "2026-07-02T12:00:00.000Z",
  },
];

describe("resolveBackground", () => {
  it("returns an existing pinned asset in pinned mode", () => {
    expect(
      resolveBackground(
        { mode: "pinned", pinnedAssetId: "asset-2" },
        assets,
        () => 0,
      ),
    ).toEqual({ mode: "pinned", asset: assets[1] });
  });

  it("falls back to the first random asset when a pin is missing", () => {
    expect(
      resolveBackground(
        { mode: "pinned", pinnedAssetId: "missing" },
        assets,
        () => 0,
      ),
    ).toEqual({ mode: "random", asset: assets[0] });
  });

  it("returns random mode without an asset when the collection is empty", () => {
    expect(resolveBackground({ mode: "random" }, [], () => 0.5)).toEqual({
      mode: "random",
      asset: undefined,
    });
  });

  it("clamps injected randomness to a safe asset index", () => {
    expect(resolveBackground({ mode: "random" }, assets, () => -10)).toEqual({
      mode: "random",
      asset: assets[0],
    });
    expect(resolveBackground({ mode: "random" }, assets, () => 10)).toEqual({
      mode: "random",
      asset: assets[1],
    });
    expect(
      resolveBackground({ mode: "random" }, assets, () => Number.NaN),
    ).toEqual({
      mode: "random",
      asset: assets[0],
    });
  });
});
