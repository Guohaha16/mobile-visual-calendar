import { describe, expect, it } from "vitest";
import type { DiaryEntry, MediaAsset } from "./types";
import { createBookGeometry, selectMonthCover } from "./shelf";

const makeAsset = (
  id: string,
  entryId: string,
  mimeType: string,
): MediaAsset => ({
  id,
  entryId,
  userId: "user-1",
  mimeType,
  sortOrder: 0,
  createdAt: "2026-07-01T12:00:00.000Z",
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
  it("returns deterministic, bounded geometry for a month", () => {
    const first = createBookGeometry(2026, 7);
    const second = createBookGeometry(2026, 7);

    expect(first).toEqual(second);
    expect(first.width).toBeGreaterThanOrEqual(72);
    expect(first.width).toBeLessThanOrEqual(104);
    expect(first.height).toBeGreaterThanOrEqual(104);
    expect(first.height).toBeLessThanOrEqual(148);
    expect(first.tilt).toBeGreaterThanOrEqual(-4);
    expect(first.tilt).toBeLessThanOrEqual(4);
    expect(first.depth).toBeGreaterThanOrEqual(10);
    expect(first.depth).toBeLessThanOrEqual(24);
    expect(first.offset).toBeGreaterThanOrEqual(-6);
    expect(first.offset).toBeLessThanOrEqual(6);
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
});
