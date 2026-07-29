import { afterEach, describe, expect, it } from "vitest";

import type { StoredPreference } from "../../domain/types";
import type { CloudGateway, CloudPullResult } from "../cloud/cloudGateway";
import { createVisualDiaryDb, type VisualDiaryDb } from "../local/db";
import {
  createDiaryRepository,
  type DiaryRepository,
} from "../local/diaryRepository";
import { OutboxProcessor } from "./outbox";

let databaseSequence = 0;
const databases: VisualDiaryDb[] = [];

const createRepository = (): DiaryRepository => {
  databaseSequence += 1;
  const database = createVisualDiaryDb(
    `outbox-processor-${databaseSequence}`,
    "user-1",
  );
  databases.push(database);

  let idSequence = 0;
  return createDiaryRepository(database, {
    userId: "user-1",
    clock: () => "2026-07-30T08:00:00.000Z",
    generateId: () => `id-${++idSequence}`,
  });
};

class FakeCloudGateway implements CloudGateway {
  readonly calls: string[] = [];
  createFailure?: Error;
  createGate?: Promise<void>;

  async ensureSession(): Promise<{ userId: string }> {
    return { userId: "user-1" };
  }

  async pushCreate(entryId: string): Promise<void> {
    this.calls.push(`create:${entryId}`);
    if (this.createFailure !== undefined) {
      const failure = this.createFailure;
      this.createFailure = undefined;
      throw failure;
    }
    await this.createGate;
  }

  async pushDelete(entryId: string, deletedAt: string): Promise<void> {
    this.calls.push(`delete:${entryId}:${deletedAt}`);
  }

  async pushPreference(preference: StoredPreference): Promise<void> {
    this.calls.push(
      `preference:${preference.value.mode}:${preference.updatedAt}`,
    );
  }

  async pullSince(cursor?: string): Promise<CloudPullResult> {
    void cursor;
    return { entries: [], cursor: "unused" };
  }
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

describe("OutboxProcessor", () => {
  it("pushes creates then deletes in persisted order and keeps tombstones hidden", async () => {
    const repository = createRepository();
    const entry = await repository.createEntry({
      entryDate: "2026-07-30",
      text: "Offline",
      media: [],
    });
    const deletedAt = "2026-07-30T09:00:00.000Z";
    await repository.deleteEntry(entry.id, deletedAt);
    const gateway = new FakeCloudGateway();
    const processor = new OutboxProcessor({
      repository,
      gateway,
      clock: () => "2026-07-30T10:00:00.000Z",
    });

    await expect(processor.flush()).resolves.toEqual({
      processed: 2,
      failed: 0,
    });

    expect(gateway.calls).toEqual([
      `create:${entry.id}`,
      `delete:${entry.id}:${deletedAt}`,
    ]);
    expect(await repository.listOutbox()).toEqual([]);
    expect(await repository.listEntriesForDate("2026-07-30")).toEqual([]);
    expect(await repository.getEntry(entry.id)).toMatchObject({
      deletedAt,
      syncState: "synced",
    });
  });

  it("backs off a failed head and prevents later work from overtaking it", async () => {
    const repository = createRepository();
    const first = await repository.createEntry({
      entryDate: "2026-07-30",
      text: "First",
      media: [],
    });
    const second = await repository.createEntry({
      entryDate: "2026-07-30",
      text: "Second",
      media: [],
    });
    const gateway = new FakeCloudGateway();
    gateway.createFailure = new Error("offline");
    let now = "2026-07-30T10:00:00.000Z";
    const processor = new OutboxProcessor({
      repository,
      gateway,
      clock: () => now,
    });

    await expect(processor.flush()).resolves.toEqual({
      processed: 0,
      failed: 1,
    });

    const failedHead = (await repository.listOutbox())[0];
    expect(failedHead).toMatchObject({
      entityId: first.id,
      state: "failed",
      attempts: 1,
      nextAttemptAt: "2026-07-30T10:00:01.000Z",
    });
    expect(gateway.calls).toEqual([`create:${first.id}`]);
    expect(await repository.getEntry(first.id)).toMatchObject({
      syncState: "failed",
    });

    await expect(processor.flush()).resolves.toEqual({
      processed: 0,
      failed: 0,
    });
    expect(gateway.calls).toEqual([`create:${first.id}`]);

    now = "2026-07-30T10:00:01.000Z";
    await expect(processor.flush()).resolves.toEqual({
      processed: 2,
      failed: 0,
    });
    expect(gateway.calls).toEqual([
      `create:${first.id}`,
      `create:${first.id}`,
      `create:${second.id}`,
    ]);
  });

  it("coalesces simultaneous flushes and makes later repeats no-ops", async () => {
    const repository = createRepository();
    const entry = await repository.createEntry({
      entryDate: "2026-07-30",
      text: "Exactly once",
      media: [],
    });
    const gateway = new FakeCloudGateway();
    let releaseCreate = () => {};
    gateway.createGate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    const processor = new OutboxProcessor({
      repository,
      gateway,
      clock: () => "2026-07-30T10:00:00.000Z",
    });

    const firstFlush = processor.flush();
    const secondFlush = processor.flush();
    await Promise.resolve();
    releaseCreate();

    await expect(Promise.all([firstFlush, secondFlush])).resolves.toEqual([
      { processed: 1, failed: 0 },
      { processed: 1, failed: 0 },
    ]);
    expect(gateway.calls).toEqual([`create:${entry.id}`]);

    await expect(processor.flush()).resolves.toEqual({
      processed: 0,
      failed: 0,
    });
    expect(gateway.calls).toEqual([`create:${entry.id}`]);
  });

  it("uses explicit preference sync and retains the operation when unsupported", async () => {
    const repository = createRepository();
    await repository.setBackgroundPreference(
      { mode: "random" },
      "2026-07-30T08:30:00.000Z",
    );
    const gateway = new FakeCloudGateway();
    const processor = new OutboxProcessor({
      repository,
      gateway,
      clock: () => "2026-07-30T10:00:00.000Z",
    });

    await expect(processor.flush()).resolves.toEqual({
      processed: 1,
      failed: 0,
    });
    expect(gateway.calls).toEqual([
      "preference:random:2026-07-30T08:30:00.000Z",
    ]);

    await repository.setBackgroundPreference(
      { mode: "pinned", pinnedAssetId: "asset-1" },
      "2026-07-30T08:31:00.000Z",
    );
    const gatewayWithoutPreference: CloudGateway = {
      ensureSession: () => gateway.ensureSession(),
      pushCreate: (entryId) => gateway.pushCreate(entryId),
      pushDelete: (entryId, deletedAt) =>
        gateway.pushDelete(entryId, deletedAt),
      pullSince: (cursor) => gateway.pullSince(cursor),
    };
    const unsupportedProcessor = new OutboxProcessor({
      repository,
      gateway: gatewayWithoutPreference,
      clock: () => "2026-07-30T10:00:00.000Z",
    });

    await expect(unsupportedProcessor.flush()).resolves.toEqual({
      processed: 0,
      failed: 1,
    });
    expect(await repository.listOutbox()).toMatchObject([
      {
        kind: "upsert-preference",
        state: "failed",
        attempts: 1,
      },
    ]);
  });
});
