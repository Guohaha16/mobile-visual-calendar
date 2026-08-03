import { describe, expect, it } from "vitest";
import type { MediaAsset } from "./types";
import {
  calendarBackgroundSurface,
  normalizeBackgroundPreferences,
  resolveBackground,
} from "./background";

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
  it("keeps the solid background even when diary images are available", () => {
    expect(resolveBackground({ mode: "solid" }, assets, () => 0)).toEqual({
      mode: "solid",
      asset: undefined,
    });
  });

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

  it("clamps negative randomness to the first asset", () => {
    expect(resolveBackground({ mode: "random" }, assets, () => -10)).toEqual({
      mode: "random",
      asset: assets[0],
    });
  });

  it("clamps randomness of exactly one to the last asset", () => {
    expect(resolveBackground({ mode: "random" }, assets, () => 1)).toEqual({
      mode: "random",
      asset: assets[1],
    });
  });

  it("treats NaN randomness as zero", () => {
    expect(
      resolveBackground({ mode: "random" }, assets, () => Number.NaN),
    ).toEqual({
      mode: "random",
      asset: assets[0],
    });
  });
});

describe("normalizeBackgroundPreferences", () => {
  it("copies a legacy single preference to both independent surfaces", () => {
    const legacy = { mode: "random" } as const;

    expect(normalizeBackgroundPreferences(legacy)).toEqual({
      home: legacy,
      calendar: legacy,
      calendarMonths: {},
    });
  });

  it("preserves distinct home and calendar preferences", () => {
    const preferences = {
      home: { mode: "random" },
      calendar: { mode: "solid" },
    } as const;

    expect(normalizeBackgroundPreferences(preferences)).toEqual({
      ...preferences,
      calendarMonths: {},
    });
  });
});

describe("calendarBackgroundSurface", () => {
  it("creates a stable year-month preference key", () => {
    expect(calendarBackgroundSurface(2026, 8)).toBe("calendar:2026-08");
  });

  it("rejects invalid calendar coordinates", () => {
    expect(() => calendarBackgroundSurface(2026, 0)).toThrow(RangeError);
    expect(() => calendarBackgroundSurface(10_000, 1)).toThrow(RangeError);
  });
});
