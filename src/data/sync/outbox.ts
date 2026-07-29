import type { OutboxOperation, StoredPreference } from "../../domain/types";
import type { CloudGateway } from "../cloud/cloudGateway";
import type { DiaryRepository } from "../local/diaryRepository";

export interface OutboxFlushResult {
  processed: number;
  failed: number;
}

type OutboxRepository = Pick<
  DiaryRepository,
  | "getBackgroundPreference"
  | "listOutbox"
  | "removeOutboxOperation"
  | "updateEntrySyncState"
  | "updateOutboxOperation"
>;

export interface OutboxProcessorDependencies {
  repository: OutboxRepository;
  gateway: CloudGateway;
  clock: () => string;
}

const retryDelay = (attempts: number): number =>
  Math.min(60_000, 1_000 * 2 ** Math.min(attempts, 6));

const timestampMillis = (timestamp: string, label: string): number => {
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError(`Invalid ${label} timestamp: ${timestamp}`);
  }
  return milliseconds;
};

export class OutboxProcessor {
  private activeFlush?: Promise<OutboxFlushResult>;

  constructor(private readonly dependencies: OutboxProcessorDependencies) {}

  flush(): Promise<OutboxFlushResult> {
    if (this.activeFlush !== undefined) {
      return this.activeFlush;
    }

    const activeFlush = this.flushOrdered();
    this.activeFlush = activeFlush;
    const clearActiveFlush = (): void => {
      if (this.activeFlush === activeFlush) {
        this.activeFlush = undefined;
      }
    };
    void activeFlush.then(clearActiveFlush, clearActiveFlush);
    return activeFlush;
  }

  private async flushOrdered(): Promise<OutboxFlushResult> {
    const operations = await this.dependencies.repository.listOutbox();
    let processed = 0;

    for (const operation of operations) {
      if (!this.isDue(operation)) {
        break;
      }

      try {
        await this.markSyncing(operation);
        await this.push(operation);
        await this.markSucceeded(operation);
        processed += 1;
      } catch {
        await this.markFailed(operation);
        return { processed, failed: 1 };
      }
    }

    return { processed, failed: 0 };
  }

  private isDue(operation: OutboxOperation): boolean {
    if (operation.state !== "failed" || operation.nextAttemptAt === undefined) {
      return true;
    }

    const now = timestampMillis(this.dependencies.clock(), "clock");
    const nextAttemptAt = timestampMillis(
      operation.nextAttemptAt,
      "next attempt",
    );
    return nextAttemptAt <= now;
  }

  private async markSyncing(operation: OutboxOperation): Promise<void> {
    await this.dependencies.repository.updateOutboxOperation(operation.id, {
      state: "syncing",
    });
    if (operation.kind !== "upsert-preference") {
      await this.dependencies.repository.updateEntrySyncState(
        operation.entityId,
        "syncing",
      );
    }
  }

  private async push(operation: OutboxOperation): Promise<void> {
    switch (operation.kind) {
      case "create-entry":
        await this.dependencies.gateway.pushCreate(
          operation.entityId,
          operation.id,
        );
        return;
      case "delete-entry":
        if (operation.deletedAt === undefined) {
          throw new Error(
            `Delete operation ${operation.id} is missing deletedAt`,
          );
        }
        await this.dependencies.gateway.pushDelete(
          operation.entityId,
          operation.deletedAt,
          operation.id,
        );
        return;
      case "upsert-preference":
        await this.pushPreference(operation);
        return;
    }
  }

  private async pushPreference(operation: OutboxOperation): Promise<void> {
    const pushPreference = this.dependencies.gateway.pushPreference;
    if (pushPreference === undefined) {
      throw new Error(
        "Cloud preference sync is paused: gateway.pushPreference is unavailable",
      );
    }

    const value =
      await this.dependencies.repository.getBackgroundPreference();
    if (value === undefined) {
      throw new Error(
        `Preference operation ${operation.id} has no local background value`,
      );
    }

    const preference: StoredPreference = {
      key: "background",
      value,
      updatedAt: operation.createdAt,
    };
    await pushPreference.call(
      this.dependencies.gateway,
      preference,
      operation.id,
    );
  }

  private async markSucceeded(operation: OutboxOperation): Promise<void> {
    if (operation.kind !== "upsert-preference") {
      await this.dependencies.repository.updateEntrySyncState(
        operation.entityId,
        "synced",
      );
    }
    await this.dependencies.repository.removeOutboxOperation(operation.id);
  }

  private async markFailed(operation: OutboxOperation): Promise<void> {
    const now = timestampMillis(this.dependencies.clock(), "clock");
    const attempts = operation.attempts + 1;
    await this.dependencies.repository.updateOutboxOperation(operation.id, {
      state: "failed",
      attempts,
      nextAttemptAt: new Date(
        now + retryDelay(attempts),
      ).toISOString(),
    });

    if (operation.kind !== "upsert-preference") {
      await this.dependencies.repository.updateEntrySyncState(
        operation.entityId,
        "failed",
      );
    }
  }
}
