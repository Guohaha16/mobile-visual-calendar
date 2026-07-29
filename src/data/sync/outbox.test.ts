import { afterEach, describe, expect, it, vi } from "vitest";

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
  readonly deliveries: string[] = [];
  readonly remoteApplications: string[] = [];
  createFailure?: Error;
  createGate?: Promise<void>;
  private readonly appliedOperationIds = new Set<string>();

  async ensureSession(): Promise<{ userId: string }> {
    return { userId: "user-1" };
  }

  async pushCreate(entryId: string, operationId: string): Promise<void> {
    this.calls.push(`create:${entryId}:${operationId}`);
    if (this.createFailure !== undefined) {
      const failure = this.createFailure;
      this.createFailure = undefined;
      throw failure;
    }
    await this.createGate;
    this.applyRemote(operationId, `create:${entryId}`);
  }

  async pushDelete(
    entryId: string,
    deletedAt: string,
    operationId: string,
  ): Promise<void> {
    this.calls.push(`delete:${entryId}:${deletedAt}:${operationId}`);
    this.applyRemote(operationId, `delete:${entryId}:${deletedAt}`);
  }

  async pushPreference(
    preference: StoredPreference,
    operationId: string,
  ): Promise<void> {
    this.calls.push(
      `preference:${preference.value.mode}:${preference.updatedAt}:${operationId}`,
    );
    this.applyRemote(operationId, `preference:${preference.value.mode}`);
  }

  async pullSince(cursor?: string): Promise<CloudPullResult> {
    void cursor;
    return { entries: [], cursor: "unused" };
  }

  private applyRemote(operationId: string, effect: string): void {
    this.deliveries.push(operationId);
    if (this.appliedOperationIds.has(operationId)) {
      return;
    }
    this.appliedOperationIds.add(operationId);
    this.remoteApplications.push(effect);
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
    const [createOperation, deleteOperation] = await repository.listOutbox();
    if (createOperation === undefined || deleteOperation === undefined) {
      throw new Error("Expected create and delete operations");
    }
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
      `create:${entry.id}:${createOperation.id}`,
      `delete:${entry.id}:${deletedAt}:${deleteOperation.id}`,
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
    const [firstOperation, secondOperation] = await repository.listOutbox();
    if (firstOperation === undefined || secondOperation === undefined) {
      throw new Error("Expected two create operations");
    }
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
      nextAttemptAt: "2026-07-30T10:00:02.000Z",
    });
    expect(gateway.calls).toEqual([
      `create:${first.id}:${firstOperation.id}`,
    ]);
    expect(await repository.getEntry(first.id)).toMatchObject({
      syncState: "failed",
    });

    await expect(processor.flush()).resolves.toEqual({
      processed: 0,
      failed: 0,
    });
    expect(gateway.calls).toEqual([
      `create:${first.id}:${firstOperation.id}`,
    ]);

    now = "2026-07-30T10:00:02.000Z";
    await expect(processor.flush()).resolves.toEqual({
      processed: 2,
      failed: 0,
    });
    expect(gateway.calls).toEqual([
      `create:${first.id}:${firstOperation.id}`,
      `create:${first.id}:${firstOperation.id}`,
      `create:${second.id}:${secondOperation.id}`,
    ]);
  });

  it.each([
    {
      name: "later failure",
      initialAttempts: 3,
      expectedAttempts: 4,
      expectedNextAttemptAt: "2026-07-30T10:00:16.000Z",
    },
    {
      name: "capped failure",
      initialAttempts: 5,
      expectedAttempts: 6,
      expectedNextAttemptAt: "2026-07-30T10:01:00.000Z",
    },
  ])(
    "backs off from the incremented attempt count for a $name",
    async ({
      initialAttempts,
      expectedAttempts,
      expectedNextAttemptAt,
    }) => {
      const repository = createRepository();
      await repository.createEntry({
        entryDate: "2026-07-30",
        text: "Retry",
        media: [],
      });
      const operation = (await repository.listOutbox())[0];
      if (operation === undefined) {
        throw new Error("Expected an outbox operation");
      }
      await repository.updateOutboxOperation(operation.id, {
        attempts: initialAttempts,
      });
      const gateway = new FakeCloudGateway();
      gateway.createFailure = new Error("offline");
      const processor = new OutboxProcessor({
        repository,
        gateway,
        clock: () => "2026-07-30T10:00:00.000Z",
      });

      await expect(processor.flush()).resolves.toEqual({
        processed: 0,
        failed: 1,
      });
      expect(await repository.getOutboxOperation(operation.id)).toMatchObject({
        attempts: expectedAttempts,
        nextAttemptAt: expectedNextAttemptAt,
      });
    },
  );

  it("coalesces simultaneous flushes and makes later repeats no-ops", async () => {
    const repository = createRepository();
    const entry = await repository.createEntry({
      entryDate: "2026-07-30",
      text: "Exactly once",
      media: [],
    });
    const gateway = new FakeCloudGateway();
    const operation = (await repository.listOutbox())[0];
    if (operation === undefined) {
      throw new Error("Expected a create operation");
    }
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
    expect(gateway.calls).toEqual([
      `create:${entry.id}:${operation.id}`,
    ]);

    await expect(processor.flush()).resolves.toEqual({
      processed: 0,
      failed: 0,
    });
    expect(gateway.calls).toEqual([
      `create:${entry.id}:${operation.id}`,
    ]);
  });

  it("uses explicit preference sync and retains the operation when unsupported", async () => {
    const repository = createRepository();
    await repository.setBackgroundPreference(
      { mode: "random" },
      "2026-07-30T08:30:00.000Z",
    );
    const firstOperation = (await repository.listOutbox())[0];
    if (firstOperation === undefined) {
      throw new Error("Expected a preference operation");
    }
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
      `preference:random:2026-07-30T08:30:00.000Z:${firstOperation.id}`,
    ]);

    await repository.setBackgroundPreference(
      { mode: "pinned", pinnedAssetId: "asset-1" },
      "2026-07-30T08:31:00.000Z",
    );
    const gatewayWithoutPreference: CloudGateway = {
      ensureSession: () => gateway.ensureSession(),
      pushCreate: (entryId, operationId) =>
        gateway.pushCreate(entryId, operationId),
      pushDelete: (entryId, deletedAt, operationId) =>
        gateway.pushDelete(entryId, deletedAt, operationId),
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

  it("replays a remotely applied operation with the same idempotency key", async () => {
    const repository = createRepository();
    const entry = await repository.createEntry({
      entryDate: "2026-07-30",
      text: "Replay",
      media: [],
    });
    const operation = (await repository.listOutbox())[0];
    if (operation === undefined) {
      throw new Error("Expected a create operation");
    }
    const gateway = new FakeCloudGateway();
    vi.spyOn(repository, "removeOutboxOperation").mockRejectedValueOnce(
      new Error("local removal failed"),
    );
    let now = "2026-07-30T10:00:00.000Z";
    const firstProcessor = new OutboxProcessor({
      repository,
      gateway,
      clock: () => now,
    });

    await expect(firstProcessor.flush()).resolves.toEqual({
      processed: 0,
      failed: 1,
    });
    expect(await repository.getOutboxOperation(operation.id)).toMatchObject({
      id: operation.id,
      state: "failed",
      attempts: 1,
      nextAttemptAt: "2026-07-30T10:00:02.000Z",
    });

    now = "2026-07-30T10:00:02.000Z";
    const retryProcessor = new OutboxProcessor({
      repository,
      gateway,
      clock: () => now,
    });
    await expect(retryProcessor.flush()).resolves.toEqual({
      processed: 1,
      failed: 0,
    });

    expect(gateway.deliveries).toEqual([operation.id, operation.id]);
    expect(gateway.remoteApplications).toEqual([`create:${entry.id}`]);
    expect(await repository.getOutboxOperation(operation.id)).toBeUndefined();
  });
});
