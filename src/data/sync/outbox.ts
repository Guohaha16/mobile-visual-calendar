import type { OutboxOperation } from "../../domain/types";
import type { CloudGateway } from "../cloud/cloudGateway";
import type { DiaryRepository } from "../local/diaryRepository";

export interface SuccessfulOutboxFlushResult {
  processed: number;
  failed: 0;
}

export interface PendingOutboxFlushResult {
  processed: number;
  failed: 0;
  pending: true;
  blockedUntil: string;
}

export interface FailedOutboxFlushResult {
  processed: number;
  failed: 1;
  blockedUntil: string;
}

export type OutboxFlushResult =
  | SuccessfulOutboxFlushResult
  | PendingOutboxFlushResult
  | FailedOutboxFlushResult;

export const OUTBOX_LEASE_MS = 30_000;

export class OutboxLeaseRecoveryError extends AggregateError {
  override readonly name = "OutboxLeaseRecoveryError";

  constructor(
    readonly operationId: string,
    readonly blockedUntil: string,
    operationError: unknown,
    persistenceError: unknown,
  ) {
    super(
      [operationError, persistenceError],
      `Failed to persist retry for outbox operation ${operationId}`,
      { cause: persistenceError },
    );
  }
}

type OutboxRepository = Pick<
  DiaryRepository,
  | "beginOutboxOperation"
  | "completeOutboxOperation"
  | "failOutboxOperation"
  | "getOutboxOperation"
  | "getStoredBackgroundPreference"
  | "listOutbox"
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

    for (const listedOperation of operations) {
      const now = this.dependencies.clock();
      const nowMillis = timestampMillis(now, "clock");
      const existingBlock = this.blockedUntil(listedOperation, nowMillis);
      if (existingBlock !== undefined) {
        return {
          processed,
          failed: 0,
          pending: true,
          blockedUntil: existingBlock,
        };
      }

      const leaseUntil = new Date(nowMillis + OUTBOX_LEASE_MS).toISOString();
      const operation =
        await this.dependencies.repository.beginOutboxOperation(
          listedOperation.id,
          now,
          leaseUntil,
        );
      if (operation === undefined) {
        const currentOperation =
          await this.dependencies.repository.getOutboxOperation(
            listedOperation.id,
          );
        if (currentOperation === undefined) {
          continue;
        }

        return {
          processed,
          failed: 0,
          pending: true,
          blockedUntil:
            this.blockedUntil(currentOperation, nowMillis) ?? leaseUntil,
        };
      }

      try {
        await this.push(operation);
        await this.dependencies.repository.completeOutboxOperation(
          operation.id,
        );
        processed += 1;
      } catch (operationError) {
        const failureNow = timestampMillis(
          this.dependencies.clock(),
          "clock",
        );
        const attempts = operation.attempts + 1;
        const nextAttemptAt = new Date(
          failureNow + retryDelay(attempts),
        ).toISOString();
        try {
          await this.dependencies.repository.failOutboxOperation(
            operation.id,
            attempts,
            nextAttemptAt,
          );
        } catch (persistenceError) {
          throw new OutboxLeaseRecoveryError(
            operation.id,
            leaseUntil,
            operationError,
            persistenceError,
          );
        }
        return { processed, failed: 1, blockedUntil: nextAttemptAt };
      }
    }

    return { processed, failed: 0 };
  }

  private blockedUntil(
    operation: OutboxOperation,
    nowMillis: number,
  ): string | undefined {
    if (
      operation.state === "waiting" ||
      operation.nextAttemptAt === undefined
    ) {
      return undefined;
    }

    const nextAttemptAt = timestampMillis(
      operation.nextAttemptAt,
      "next attempt",
    );
    return nextAttemptAt > nowMillis ? operation.nextAttemptAt : undefined;
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
    const preference =
      await this.dependencies.repository.getStoredBackgroundPreference();
    if (preference === undefined) {
      throw new Error(
        `Preference operation ${operation.id} has no local background value`,
      );
    }

    await this.dependencies.gateway.pushPreference(
      preference,
      operation.id,
    );
  }
}
