import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BackgroundPreference } from "../../domain/types";
import { createVisualDiaryDb, type VisualDiaryDb } from "./db";
import {
  createDiaryRepository,
  type DiaryRepository,
} from "./diaryRepository";

let databaseSequence = 0;
let database: VisualDiaryDb;
let repository: DiaryRepository;

const makeIdGenerator = () => {
  let sequence = 0;
  return () => `id-${String(++sequence).padStart(2, "0")}`;
};

const makeClock = (...timestamps: string[]) => {
  let index = 0;
  return () => {
    const timestamp = timestamps[index] ?? timestamps.at(-1);
    index += 1;

    if (timestamp === undefined) {
      throw new Error("Test clock has no timestamps");
    }

    return timestamp;
  };
};

beforeEach(() => {
  databaseSequence += 1;
  database = createVisualDiaryDb(`diary-repository-${databaseSequence}`);
  repository = createDiaryRepository(database, {
    userId: "user-1",
    clock: makeClock("2026-07-29T10:00:00.000Z"),
    generateId: makeIdGenerator(),
  });
});

afterEach(async () => {
  await database.delete();
});

describe("visual diary database", () => {
  it("uses the exact version 1 schema", async () => {
    await database.open();

    const schemas = Object.fromEntries(
      database.tables.map((table) => [
        table.name,
        [table.schema.primKey.src, ...table.schema.indexes.map((index) => index.src)].join(
          ", ",
        ),
      ]),
    );

    expect(schemas).toEqual({
      entries: "id, entryDate, createdAt, updatedAt, deletedAt, syncState",
      media: "id, entryId, userId, createdAt, storagePath",
      outbox: "id, kind, createdAt, nextAttemptAt, state",
      preferences: "key, updatedAt",
      syncMeta: "key",
    });
  });
});

describe("diary repository", () => {
  it("creates, lists, and tombstones an entry while retaining ordered outbox work", async () => {
    const saved = await repository.createEntry({
      entryDate: "2026-07-29",
      text: "A long afternoon",
      media: [],
    });

    expect(saved.syncState).toBe("waiting");
    expect(await repository.listEntriesForDate("2026-07-29")).toEqual([saved]);
    expect(await repository.listYearImages(2026)).toEqual([]);
    expect(await repository.listDiaryImages()).toEqual([]);

    await repository.deleteEntry(saved.id, "2026-07-29T12:00:00.000Z");

    expect(await repository.listEntriesForDate("2026-07-29")).toEqual([]);
    expect(await repository.listOutbox()).toMatchObject([
      { kind: "create-entry" },
      { kind: "delete-entry" },
    ]);
  });

  it("rolls back the entry and media when enqueueing fails", async () => {
    vi.spyOn(database.outbox, "add").mockRejectedValueOnce(
      new Error("outbox unavailable"),
    );

    await expect(
      repository.createEntry({
        entryDate: "2026-07-29",
        text: "Will roll back",
        media: [{ mimeType: "image/jpeg" }],
      }),
    ).rejects.toThrow("outbox unavailable");

    expect(await database.entries.count()).toBe(0);
    expect(await database.media.count()).toBe(0);
    expect(await database.outbox.count()).toBe(0);
  });

  it("hydrates media in sort order and lists only live diary images", async () => {
    repository = createDiaryRepository(database, {
      userId: "user-1",
      clock: makeClock(
        "2026-07-29T11:00:00.000Z",
        "2026-01-02T09:00:00.000Z",
        "2025-12-31T18:00:00.000Z",
      ),
      generateId: makeIdGenerator(),
    });

    const later = await repository.createEntry({
      entryDate: "2026-07-29",
      text: "Later",
      media: [
        { mimeType: "image/png", sortOrder: 2, storagePath: "later-two.png" },
        { mimeType: "text/plain", sortOrder: 0, storagePath: "notes.txt" },
        { mimeType: "image/jpeg", sortOrder: 1, storagePath: "later-one.jpg" },
      ],
    });
    const earlier = await repository.createEntry({
      entryDate: "2026-01-02",
      text: "Earlier",
      media: [{ mimeType: "image/webp", storagePath: "earlier.webp" }],
    });
    await repository.createEntry({
      entryDate: "2025-12-31",
      text: "Last year",
      media: [{ mimeType: "image/png", storagePath: "last-year.png" }],
    });

    expect((await repository.getEntry(later.id))?.media.map((asset) => asset.storagePath)).toEqual(
      ["notes.txt", "later-one.jpg", "later-two.png"],
    );
    expect((await repository.listEntriesForDate("2026-07-29"))[0]?.media).toEqual(
      later.media,
    );
    expect((await repository.listEntriesForYear(2026)).map((entry) => entry.id)).toEqual([
      earlier.id,
      later.id,
    ]);
    expect((await repository.listYearImages(2026)).map((asset) => asset.storagePath)).toEqual([
      "earlier.webp",
      "later-one.jpg",
      "later-two.png",
    ]);
    expect((await repository.listDiaryImages()).map((asset) => asset.storagePath)).toEqual([
      "last-year.png",
      "earlier.webp",
      "later-one.jpg",
      "later-two.png",
    ]);

    await repository.deleteEntry(earlier.id, "2026-07-30T00:00:00.000Z");

    expect((await repository.listYearImages(2026)).map((asset) => asset.storagePath)).toEqual([
      "later-one.jpg",
      "later-two.png",
    ]);
    expect((await repository.listDiaryImages()).map((asset) => asset.storagePath)).not.toContain(
      "earlier.webp",
    );
  });

  it("rejects malformed local dates and invalid years", async () => {
    await expect(
      repository.createEntry({
        entryDate: "2026-02-30",
        text: "Impossible date",
        media: [],
      }),
    ).rejects.toThrow("Invalid local date key");
    await expect(repository.listEntriesForDate("2026-7-29")).rejects.toThrow(
      "Invalid local date key",
    );
    await expect(repository.listEntriesForYear(2026.5)).rejects.toThrow(
      "Invalid diary year",
    );
    await expect(repository.listYearImages(10_000)).rejects.toThrow(
      "Invalid diary year",
    );
  });

  it("gets media and manages background preference atomically with its outbox operation", async () => {
    const saved = await repository.createEntry({
      entryDate: "2026-07-29",
      text: "With media",
      media: [{ mimeType: "image/jpeg", storagePath: "photo.jpg" }],
    });
    const media = saved.media[0];
    const preference: BackgroundPreference = {
      mode: "pinned",
      pinnedAssetId: media?.id ?? "",
    };

    expect(media).toBeDefined();
    expect(await repository.getMedia(media?.id ?? "")).toEqual(media);
    expect(await repository.listMediaForEntry(saved.id)).toEqual(saved.media);

    await repository.setBackgroundPreference(
      preference,
      "2026-07-29T11:00:00.000Z",
    );

    expect(await repository.getBackgroundPreference()).toEqual(preference);
    expect((await repository.listOutbox()).at(-1)).toMatchObject({
      kind: "upsert-preference",
      entityId: "background",
      createdAt: "2026-07-29T11:00:00.000Z",
    });

    vi.spyOn(database.outbox, "add").mockRejectedValueOnce(
      new Error("preference enqueue failed"),
    );
    await expect(
      repository.setBackgroundPreference(
        { mode: "random" },
        "2026-07-29T12:00:00.000Z",
      ),
    ).rejects.toThrow("preference enqueue failed");
    expect(await repository.getBackgroundPreference()).toEqual(preference);
  });

  it("supports deterministic outbox processing and entry sync-state updates", async () => {
    const first = await repository.createEntry({
      entryDate: "2026-07-29",
      text: "First",
      media: [],
    });
    await repository.deleteEntry(first.id, "2026-07-29T12:00:00.000Z");

    const operations = await repository.listOutbox();
    const createOperation = operations[0];

    expect(createOperation).toBeDefined();
    expect(operations.map((operation) => operation.kind)).toEqual([
      "create-entry",
      "delete-entry",
    ]);

    if (createOperation === undefined) {
      throw new Error("Expected a create operation");
    }

    await repository.updateOutboxOperation(createOperation.id, {
      attempts: 1,
      state: "failed",
      nextAttemptAt: "2026-07-29T12:01:00.000Z",
    });
    expect(await repository.getOutboxOperation(createOperation.id)).toMatchObject({
      attempts: 1,
      state: "failed",
      nextAttemptAt: "2026-07-29T12:01:00.000Z",
    });

    await repository.updateEntrySyncState(first.id, "syncing");
    expect((await repository.getEntry(first.id))?.syncState).toBe("syncing");

    await repository.removeOutboxOperation(createOperation.id);
    expect(await repository.getOutboxOperation(createOperation.id)).toBeUndefined();
  });

  it("gets and sets the sync cursor", async () => {
    expect(await repository.getSyncCursor()).toBeUndefined();

    await repository.setSyncCursor("cursor-1");

    expect(await repository.getSyncCursor()).toBe("cursor-1");
  });

  it("notifies subscribers after successful mutations", async () => {
    const listener = vi.fn();
    const unsubscribe = repository.subscribeToMutations(listener);

    await repository.createEntry({
      entryDate: "2026-07-29",
      text: "Notify",
      media: [],
    });
    await repository.setBackgroundPreference(
      { mode: "random" },
      "2026-07-29T11:00:00.000Z",
    );
    unsubscribe();
    await repository.setSyncCursor("after-unsubscribe");

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
