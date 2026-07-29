import { Blob as NodeBlob } from "node:buffer";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BackgroundPreference } from "../../domain/types";
import { createVisualDiaryDb, type VisualDiaryDb } from "./db";
import {
  createDiaryRepository,
  type DiaryRepository,
} from "./diaryRepository";

let databaseSequence = 0;
let databaseBaseName: string;
let databases: VisualDiaryDb[];
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

const createPersistableBlob = (contents: string): Blob => {
  // Node and DOM Blob stream generics differ, but fake-indexeddb clones Node Blob.
  return new NodeBlob([contents], { type: "image/jpeg" }) as unknown as Blob;
};

const createTestDatabase = (
  userId = "user-1",
  baseName = databaseBaseName,
): VisualDiaryDb => {
  const testDatabase = createVisualDiaryDb(baseName, userId);
  databases.push(testDatabase);
  return testDatabase;
};

beforeEach(() => {
  databaseSequence += 1;
  databaseBaseName = `diary-repository-${databaseSequence}`;
  databases = [];
  database = createTestDatabase();
  repository = createDiaryRepository(database, {
    userId: "user-1",
    clock: makeClock("2026-07-29T10:00:00.000Z"),
    generateId: makeIdGenerator(),
  });
});

afterEach(async () => {
  const uniqueDatabases = new Map(
    databases.map((testDatabase) => [testDatabase.name, testDatabase]),
  );
  for (const testDatabase of databases) {
    testDatabase.close();
  }
  await Promise.all(
    [...uniqueDatabases.values()].map((testDatabase) => testDatabase.delete()),
  );
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
    expect(await repository.getEntry(saved.id)).toMatchObject({
      deletedAt: "2026-07-29T12:00:00.000Z",
      updatedAt: "2026-07-29T12:00:00.000Z",
      syncState: "waiting",
    });
    expect(await repository.listOutbox()).toMatchObject([
      { kind: "create-entry" },
      {
        kind: "delete-entry",
        deletedAt: "2026-07-29T12:00:00.000Z",
      },
    ]);
  });

  it("allocates strictly increasing outbox timestamps with a fixed clock and reverse IDs", async () => {
    const ids = ["entry-id", "z-create-operation", "a-delete-operation"];
    repository = createDiaryRepository(database, {
      userId: "user-1",
      clock: () => "2026-07-29T10:00:00.000Z",
      generateId: () => {
        const id = ids.shift();
        if (id === undefined) {
          throw new Error("Test ID generator exhausted");
        }
        return id;
      },
    });

    const saved = await repository.createEntry({
      entryDate: "2026-07-29",
      text: "Ordered",
      media: [],
    });
    await repository.deleteEntry(saved.id, "2026-07-29T10:00:00.000Z");

    expect(await repository.listOutbox()).toMatchObject([
      {
        id: "z-create-operation",
        kind: "create-entry",
        createdAt: "2026-07-29T10:00:00.000Z",
      },
      {
        id: "a-delete-operation",
        kind: "delete-entry",
        createdAt: "2026-07-29T10:00:00.001Z",
      },
    ]);
  });

  it("appends another delete operation when an entry is deleted repeatedly", async () => {
    const saved = await repository.createEntry({
      entryDate: "2026-07-29",
      text: "Delete twice",
      media: [],
    });

    await repository.deleteEntry(saved.id, "2026-07-29T12:00:00.000Z");
    await repository.deleteEntry(saved.id, "2026-07-29T13:00:00.000Z");

    expect((await repository.listOutbox()).map((operation) => operation.kind)).toEqual([
      "create-entry",
      "delete-entry",
      "delete-entry",
    ]);
    expect(await repository.getEntry(saved.id)).toMatchObject({
      deletedAt: "2026-07-29T13:00:00.000Z",
      updatedAt: "2026-07-29T13:00:00.000Z",
      syncState: "waiting",
    });
  });

  it("isolates entries, outbox, preferences, and cursors by database owner", async () => {
    const secondDatabase = createTestDatabase("user-2");
    const secondRepository = createDiaryRepository(secondDatabase, {
      userId: "user-2",
      clock: makeClock("2026-07-29T10:00:00.000Z"),
      generateId: makeIdGenerator(),
    });

    await repository.createEntry({
      entryDate: "2026-07-29",
      text: "First user",
      media: [],
    });
    await repository.setBackgroundPreference({ mode: "random" });
    await repository.setSyncCursor("cursor-user-1");

    expect(database.name).not.toBe(secondDatabase.name);
    expect(await secondRepository.listEntriesForDate("2026-07-29")).toEqual([]);
    expect(await secondRepository.listOutbox()).toEqual([]);
    expect(await secondRepository.getBackgroundPreference()).toBeUndefined();
    expect(await secondRepository.getSyncCursor()).toBeUndefined();

    await secondRepository.createEntry({
      entryDate: "2026-07-29",
      text: "Second user",
      media: [],
    });
    await secondRepository.setBackgroundPreference({
      mode: "pinned",
      pinnedAssetId: "second-user-asset",
    });
    await secondRepository.setSyncCursor("cursor-user-2");

    expect((await repository.listEntriesForDate("2026-07-29"))[0]?.text).toBe(
      "First user",
    );
    expect((await secondRepository.listEntriesForDate("2026-07-29"))[0]?.text).toBe(
      "Second user",
    );
    expect(await repository.getBackgroundPreference()).toEqual({ mode: "random" });
    expect(await secondRepository.getBackgroundPreference()).toEqual({
      mode: "pinned",
      pinnedAssetId: "second-user-asset",
    });
    expect(await repository.getSyncCursor()).toBe("cursor-user-1");
    expect(await secondRepository.getSyncCursor()).toBe("cursor-user-2");
    expect(await repository.listOutbox()).toHaveLength(2);
    expect(await secondRepository.listOutbox()).toHaveLength(2);
  });

  it("refuses a repository user that does not own the database", () => {
    expect(() =>
      createDiaryRepository(database, {
        userId: "user-2",
        clock: makeClock("2026-07-29T10:00:00.000Z"),
        generateId: makeIdGenerator(),
      }),
    ).toThrow("does not match database owner");
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

  it("batch-hydrates collection queries with one media lookup each", async () => {
    await repository.createEntry({
      entryDate: "2026-07-29",
      text: "First",
      media: [{ mimeType: "image/png" }],
    });
    await repository.createEntry({
      entryDate: "2026-07-29",
      text: "Second",
      media: [{ mimeType: "image/jpeg" }],
    });
    const mediaWhere = vi.spyOn(database.media, "where");

    await repository.listEntriesForDate("2026-07-29");
    expect(mediaWhere).toHaveBeenCalledTimes(1);

    mediaWhere.mockClear();
    await repository.listEntriesForYear(2026);
    expect(mediaWhere).toHaveBeenCalledTimes(1);

    mediaWhere.mockClear();
    await repository.listDiaryImages();
    expect(mediaWhere).toHaveBeenCalledTimes(1);
  });

  it("filters foreign entries before validating local dates", async () => {
    await repository.createEntry({
      entryDate: "2026-07-29",
      text: "Owned",
      media: [{ mimeType: "image/png", storagePath: "owned.png" }],
    });
    await database.entries.add({
      id: "foreign-entry",
      userId: "foreign-user",
      entryDate: "2026-99-99",
      text: "Malformed foreign row",
      createdAt: "2026-07-29T10:00:00.000Z",
      updatedAt: "2026-07-29T10:00:00.000Z",
      media: [],
      syncState: "synced",
    });

    await expect(repository.listEntriesForYear(2026)).resolves.toHaveLength(1);
    await expect(repository.listDiaryImages()).resolves.toMatchObject([
      { storagePath: "owned.png" },
    ]);
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
    const originalBlob = createPersistableBlob("full image");
    const originalThumbnail = createPersistableBlob("thumbnail");
    const saved = await repository.createEntry({
      entryDate: "2026-07-29",
      text: "With media",
      media: [
        {
          mimeType: "image/jpeg",
          storagePath: "photo.jpg",
          localBlob: originalBlob,
          thumbnailBlob: originalThumbnail,
        },
      ],
    });
    const media = saved.media[0];
    const preference: BackgroundPreference = {
      mode: "pinned",
      pinnedAssetId: media?.id ?? "",
    };

    expect(media).toBeDefined();
    expect(await repository.getMedia(media?.id ?? "")).toMatchObject({
      id: media?.id,
      storagePath: "photo.jpg",
    });
    expect(await repository.listMediaForEntry(saved.id)).toHaveLength(1);
    expect(await (await repository.getMedia(media?.id ?? ""))?.localBlob?.text()).toBe(
      "full image",
    );
    expect(
      await (await repository.getMedia(media?.id ?? ""))?.thumbnailBlob?.text(),
    ).toBe("thumbnail");

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

  it("atomically persists owned cloud storage paths while retaining local blobs", async () => {
    const originalBlob = createPersistableBlob("offline original");
    const originalThumbnail = createPersistableBlob("offline thumbnail");
    const saved = await repository.createEntry({
      entryDate: "2026-07-29",
      text: "Pending cloud metadata",
      media: [
        {
          mimeType: "image/png",
          localBlob: originalBlob,
          thumbnailBlob: originalThumbnail,
        },
      ],
    });
    const ownedMedia = saved.media[0];
    if (ownedMedia === undefined) {
      throw new Error("Expected owned media");
    }
    await database.media.add({
      ...ownedMedia,
      id: "foreign-media",
      userId: "user-2",
    });
    const outboxCount = (await repository.listOutbox()).length;

    await expect(
      repository.updateMediaStoragePaths([
        {
          id: ownedMedia.id,
          storagePath: "user-1/2026/07/owned.png",
        },
        {
          id: "foreign-media",
          storagePath: "user-2/2026/07/foreign.png",
        },
      ]),
    ).rejects.toThrow("Media asset not found");
    expect((await repository.getMedia(ownedMedia.id))?.storagePath).toBeUndefined();

    await repository.updateMediaStoragePaths([
      {
        id: ownedMedia.id,
        storagePath: "user-1/2026/07/owned.png",
      },
    ]);

    const persisted = await repository.getMedia(ownedMedia.id);
    expect(persisted?.storagePath).toBe("user-1/2026/07/owned.png");
    expect(await persisted?.localBlob?.text()).toBe("offline original");
    expect(await persisted?.thumbnailBlob?.text()).toBe("offline thumbnail");
    expect(await repository.listOutbox()).toHaveLength(outboxCount);
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

  it("allows only one concurrent claim across repository instances", async () => {
    const peerDatabase = createTestDatabase();
    const peerRepository = createDiaryRepository(peerDatabase, {
      userId: "user-1",
      clock: makeClock("2026-07-29T10:00:00.000Z"),
      generateId: makeIdGenerator(),
    });
    const saved = await repository.createEntry({
      entryDate: "2026-07-29",
      text: "Claim once",
      media: [],
    });
    const operation = (await repository.listOutbox())[0];
    if (operation === undefined) {
      throw new Error("Expected an outbox operation");
    }

    const claims = await Promise.all([
      repository.beginOutboxOperation(
        operation.id,
        "2026-07-29T10:00:00.000Z",
        "2026-07-29T10:01:00.000Z",
      ),
      peerRepository.beginOutboxOperation(
        operation.id,
        "2026-07-29T10:00:00.000Z",
        "2026-07-29T10:01:00.000Z",
      ),
    ]);

    expect(claims.filter((claim) => claim !== undefined)).toHaveLength(1);
    expect(await repository.getOutboxOperation(operation.id)).toMatchObject({
      state: "syncing",
      nextAttemptAt: "2026-07-29T10:01:00.000Z",
    });
    expect(await repository.getEntry(saved.id)).toMatchObject({
      syncState: "syncing",
    });
  });

  it("blocks an active lease and reclaims it when due", async () => {
    const saved = await repository.createEntry({
      entryDate: "2026-07-29",
      text: "Leased",
      media: [],
    });
    const operation = (await repository.listOutbox())[0];
    if (operation === undefined) {
      throw new Error("Expected an outbox operation");
    }

    await expect(
      repository.beginOutboxOperation(
        operation.id,
        "2026-07-29T10:00:00.000Z",
        "2026-07-29T10:01:00.000Z",
      ),
    ).resolves.toMatchObject({ state: "syncing" });
    await expect(
      repository.beginOutboxOperation(
        operation.id,
        "2026-07-29T10:00:59.999Z",
        "2026-07-29T10:02:00.000Z",
      ),
    ).resolves.toBeUndefined();
    await expect(
      repository.beginOutboxOperation(
        operation.id,
        "2026-07-29T10:01:00.000Z",
        "2026-07-29T10:02:00.000Z",
      ),
    ).resolves.toMatchObject({
      id: operation.id,
      state: "syncing",
      nextAttemptAt: "2026-07-29T10:02:00.000Z",
    });
    expect(await repository.getEntry(saved.id)).toMatchObject({
      syncState: "syncing",
    });
  });

  it("atomically begins, fails, reclaims, and completes entry operations", async () => {
    const saved = await repository.createEntry({
      entryDate: "2026-07-29",
      text: "Transition",
      media: [],
    });
    const operation = (await repository.listOutbox())[0];
    if (operation === undefined) {
      throw new Error("Expected an outbox operation");
    }

    await repository.beginOutboxOperation(
      operation.id,
      "2026-07-29T10:00:00.000Z",
      "2026-07-29T10:01:00.000Z",
    );
    await repository.failOutboxOperation(
      operation.id,
      2,
      "2026-07-29T10:02:00.000Z",
    );

    expect(await repository.getOutboxOperation(operation.id)).toEqual({
      ...operation,
      state: "failed",
      attempts: 2,
      nextAttemptAt: "2026-07-29T10:02:00.000Z",
    });
    expect(await repository.getEntry(saved.id)).toMatchObject({
      syncState: "failed",
    });
    await expect(
      repository.beginOutboxOperation(
        operation.id,
        "2026-07-29T10:01:59.999Z",
        "2026-07-29T10:03:00.000Z",
      ),
    ).resolves.toBeUndefined();
    await repository.beginOutboxOperation(
      operation.id,
      "2026-07-29T10:02:00.000Z",
      "2026-07-29T10:03:00.000Z",
    );
    await repository.completeOutboxOperation(operation.id);

    expect(await repository.getOutboxOperation(operation.id)).toBeUndefined();
    expect(await repository.getEntry(saved.id)).toMatchObject({
      syncState: "synced",
    });
    await expect(
      repository.completeOutboxOperation(operation.id),
    ).resolves.toBeUndefined();
    await expect(
      repository.failOutboxOperation(
        operation.id,
        3,
        "2026-07-29T10:04:00.000Z",
      ),
    ).resolves.toBeUndefined();
    expect(await repository.getEntry(saved.id)).toMatchObject({
      syncState: "synced",
    });
  });

  it("rolls back completion when outbox removal fails", async () => {
    const saved = await repository.createEntry({
      entryDate: "2026-07-29",
      text: "Rollback completion",
      media: [],
    });
    const operation = (await repository.listOutbox())[0];
    if (operation === undefined) {
      throw new Error("Expected an outbox operation");
    }
    await repository.beginOutboxOperation(
      operation.id,
      "2026-07-29T10:00:00.000Z",
      "2026-07-29T10:01:00.000Z",
    );
    vi.spyOn(database.outbox, "delete").mockRejectedValueOnce(
      new Error("delete failed"),
    );

    await expect(
      repository.completeOutboxOperation(operation.id),
    ).rejects.toThrow("delete failed");

    expect(await repository.getOutboxOperation(operation.id)).toMatchObject({
      state: "syncing",
    });
    expect(await repository.getEntry(saved.id)).toMatchObject({
      syncState: "syncing",
    });
  });

  it("validates lease and retry timestamps", async () => {
    const saved = await repository.createEntry({
      entryDate: "2026-07-29",
      text: "Validate transitions",
      media: [],
    });
    const operation = (await repository.listOutbox())[0];
    if (operation === undefined) {
      throw new Error("Expected an outbox operation");
    }

    await expect(
      repository.beginOutboxOperation(
        operation.id,
        "not-a-time",
        "2026-07-29T10:01:00.000Z",
      ),
    ).rejects.toThrow("Invalid now timestamp");
    await expect(
      repository.beginOutboxOperation(
        operation.id,
        "2026-07-29T10:00:00.000Z",
        "2026-07-29T10:00:00.000Z",
      ),
    ).rejects.toThrow("Lease must end after now");
    await expect(
      repository.failOutboxOperation(operation.id, 1, "not-a-time"),
    ).rejects.toThrow("Invalid next attempt timestamp");
    expect(await repository.getEntry(saved.id)).toMatchObject({
      syncState: "waiting",
    });
    expect(await repository.getOutboxOperation(operation.id)).toMatchObject({
      state: "waiting",
    });
  });

  it("returns the stored preference snapshot and coalesces non-syncing work", async () => {
    await repository.setBackgroundPreference(
      { mode: "random" },
      "2026-07-29T11:00:00.000Z",
    );
    const firstOperation = (await repository.listOutbox())[0];
    if (firstOperation === undefined) {
      throw new Error("Expected a preference operation");
    }
    await repository.failOutboxOperation(
      firstOperation.id,
      1,
      "2026-07-29T11:01:00.000Z",
    );

    await repository.setBackgroundPreference(
      { mode: "pinned", pinnedAssetId: "asset-1" },
      "2026-07-29T12:00:00.000Z",
    );
    await repository.setBackgroundPreference(
      { mode: "random" },
      "2026-07-29T13:00:00.000Z",
    );

    expect(await repository.getStoredBackgroundPreference()).toEqual({
      key: "background",
      value: { mode: "random" },
      updatedAt: "2026-07-29T13:00:00.000Z",
    });
    expect(await repository.getBackgroundPreference()).toEqual({
      mode: "random",
    });
    expect(await repository.listOutbox()).toMatchObject([
      {
        kind: "upsert-preference",
        state: "waiting",
        attempts: 0,
        createdAt: "2026-07-29T13:00:00.000Z",
      },
    ]);
  });

  it("retains a syncing preference operation while enqueueing the latest snapshot", async () => {
    await repository.setBackgroundPreference(
      { mode: "random" },
      "2026-07-29T11:00:00.000Z",
    );
    const syncingOperation = (await repository.listOutbox())[0];
    if (syncingOperation === undefined) {
      throw new Error("Expected a preference operation");
    }
    await repository.beginOutboxOperation(
      syncingOperation.id,
      "2026-07-29T11:00:00.000Z",
      "2026-07-29T11:10:00.000Z",
    );

    await repository.setBackgroundPreference(
      { mode: "pinned", pinnedAssetId: "asset-latest" },
      "2026-07-29T12:00:00.000Z",
    );

    expect(await repository.getStoredBackgroundPreference()).toEqual({
      key: "background",
      value: { mode: "pinned", pinnedAssetId: "asset-latest" },
      updatedAt: "2026-07-29T12:00:00.000Z",
    });
    expect(await repository.listOutbox()).toMatchObject([
      {
        id: syncingOperation.id,
        kind: "upsert-preference",
        state: "syncing",
      },
      {
        kind: "upsert-preference",
        state: "waiting",
        createdAt: "2026-07-29T12:00:00.000Z",
      },
    ]);
  });

  it("does not notify mutation listeners for internal sync transitions", async () => {
    const listener = vi.fn();
    repository.subscribeToMutations(listener);
    await repository.createEntry({
      entryDate: "2026-07-29",
      text: "Quiet transitions",
      media: [],
    });
    const operation = (await repository.listOutbox())[0];
    if (operation === undefined) {
      throw new Error("Expected an outbox operation");
    }
    listener.mockClear();

    await repository.beginOutboxOperation(
      operation.id,
      "2026-07-29T10:00:00.000Z",
      "2026-07-29T10:01:00.000Z",
    );
    await repository.failOutboxOperation(
      operation.id,
      1,
      "2026-07-29T10:02:00.000Z",
    );
    await repository.beginOutboxOperation(
      operation.id,
      "2026-07-29T10:02:00.000Z",
      "2026-07-29T10:03:00.000Z",
    );
    await repository.completeOutboxOperation(operation.id);

    expect(listener).not.toHaveBeenCalled();
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

  it("isolates listener failures and notifies a listener snapshot", async () => {
    const laterListener = vi.fn();
    let unsubscribeLater = () => {};

    repository.subscribeToMutations(() => {
      unsubscribeLater();
      throw new Error("listener failed");
    });
    unsubscribeLater = repository.subscribeToMutations(laterListener);

    await expect(
      repository.createEntry({
        entryDate: "2026-07-29",
        text: "Committed despite listener",
        media: [],
      }),
    ).resolves.toMatchObject({ text: "Committed despite listener" });

    expect(laterListener).toHaveBeenCalledTimes(1);
    expect(await repository.listEntriesForDate("2026-07-29")).toHaveLength(1);
  });
});
