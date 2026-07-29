import { describe, expect, it } from "vitest";
import type { DiaryEntry, MediaAsset } from "./types";
import { createBookGeometry, selectMonthCover } from "./shelf";

const makeAsset = (
  id: string,
  entryId: string,
  mimeType: string,
  sortOrder = 0,
  createdAt = "2026-07-01T12:00:00.000Z",
): MediaAsset => ({
  id,
  entryId,
  userId: "user-1",
  mimeType,
  sortOrder,
  createdAt,
});

const makeEntry = (
  id: string,
  entryDate: string,
  media: MediaAsset[],
  deletedAt?: string,
): DiaryEntry => ({
  id,
  userId: "user-1",
  entryDate,
  text: "",
  createdAt: `${entryDate}T12:00:00.000Z`,
  updatedAt: `${entryDate}T12:00:00.000Z`,
  deletedAt,
  media,
  syncState: "synced",
});

describe("createBookGeometry", () => {
  it("returns deterministic geometry for a month", () => {
    const first = createBookGeometry(2026, 7);
    const second = createBookGeometry(2026, 7);

    expect(first).toEqual(second);
  });

  it("keeps geometry bounded for every month", () => {
    for (let month = 1; month <= 12; month += 1) {
      const geometry = createBookGeometry(2026, month);

      expect(geometry.width).toBeGreaterThanOrEqual(72);
      expect(geometry.width).toBeLessThanOrEqual(104);
      expect(geometry.height).toBeGreaterThanOrEqual(104);
      expect(geometry.height).toBeLessThanOrEqual(148);
      expect(geometry.tilt).toBeGreaterThanOrEqual(-4);
      expect(geometry.tilt).toBeLessThanOrEqual(4);
      expect(geometry.depth).toBeGreaterThanOrEqual(10);
      expect(geometry.depth).toBeLessThanOrEqual(24);
      expect(geometry.offset).toBeGreaterThanOrEqual(-6);
      expect(geometry.offset).toBeLessThanOrEqual(6);
    }
  });

  it("varies geometry between July and August", () => {
    expect(createBookGeometry(2026, 7)).not.toEqual(
      createBookGeometry(2026, 8),
    );
  });

  it("rejects invalid months", () => {
    expect(() => createBookGeometry(2026, 0)).toThrow(RangeError);
    expect(() => createBookGeometry(2026, 13)).toThrow(RangeError);
  });

  it("supports years 1000 through 9999", () => {
    expect(() => createBookGeometry(1000, 1)).not.toThrow();
    expect(() => createBookGeometry(9999, 12)).not.toThrow();
    expect(() => createBookGeometry(999, 12)).toThrow(RangeError);
    expect(() => createBookGeometry(10000, 1)).toThrow(RangeError);
  });
});

describe("selectMonthCover", () => {
  it("selects the latest image asset by entry chronology", () => {
    const entries = [
      makeEntry("entry-old", "2026-07-02", [
        makeAsset("old-image-id", "entry-old", "image/jpeg"),
      ]),
      makeEntry("entry-new", "2026-07-29", [
        makeAsset("latest-video-id", "entry-new", "video/mp4"),
        makeAsset("latest-image-id", "entry-new", "image/webp"),
      ]),
      makeEntry(
        "entry-deleted",
        "2026-07-30",
        [makeAsset("deleted-image-id", "entry-deleted", "image/png")],
        "2026-07-30T13:00:00.000Z",
      ),
    ];

    expect(selectMonthCover(entries)).toBe("latest-image-id");
  });

  it("returns undefined when no diary image exists", () => {
    const entries = [
      makeEntry("entry-video", "2026-07-29", [
        makeAsset("video-id", "entry-video", "video/mp4"),
      ]),
    ];

    expect(selectMonthCover(entries)).toBeUndefined();
  });

  it("uses media sort order and stable tie-breaking within the latest entry", () => {
    const entries = [
      makeEntry("entry-new", "2026-07-29", [
        makeAsset("later-sort", "entry-new", "image/jpeg", 1),
        makeAsset("tie-b", "entry-new", "image/png", 0),
        makeAsset("tie-a", "entry-new", "image/webp", 0),
      ]),
    ];

    expect(selectMonthCover(entries)).toBe("tie-a");
  });
});
