import {
  CloudSessionPausedError,
  type CloudGateway,
  type CloudPullResult,
} from "../cloud/cloudGateway";
import type { DiaryRepository } from "../local/diaryRepository";
import type { OutboxFlushResult } from "./outbox";

export type SyncStatus =
  | "idle"
  | "waiting"
  | "syncing"
  | "failed"
  | "paused";

export type SyncRepository = Pick<
  DiaryRepository,
  "getSyncCursor" | "subscribeToMutations"
>;

export interface OutboxFlusher {
  flush(): Promise<OutboxFlushResult>;
}

export interface OnlineMonitor {
  isOnline(): boolean;
  addEventListener(
    type: "online" | "offline",
    listener: () => void,
  ): void;
  removeEventListener(
    type: "online" | "offline",
    listener: () => void,
  ): void;
}

export interface SyncScheduler {
  schedule(callback: () => void, delayMs: number): () => void;
}

export interface SyncServiceDependencies {
  repository: SyncRepository;
  gateway?: CloudGateway;
  outbox: OutboxFlusher;
  /**
   * Applies the pull batch and persists result.cursor as one atomic or
   * idempotent durability boundary.
   */
  commitPull(result: CloudPullResult): Promise<void>;
  online?: OnlineMonitor;
  clock?: () => string;
  scheduler?: SyncScheduler;
}

type CycleOutcome = "complete" | "rerun" | "stopped";

const timestampMillis = (timestamp: string, label: string): number => {
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError(`Invalid ${label} timestamp: ${timestamp}`);
  }
  return milliseconds;
};

const createBrowserOnlineMonitor = (): OnlineMonitor => ({
  isOnline: () => navigator.onLine,
  addEventListener: (type, listener) => {
    window.addEventListener(type, listener);
  },
  removeEventListener: (type, listener) => {
    window.removeEventListener(type, listener);
  },
});

const createBrowserScheduler = (): SyncScheduler => ({
  schedule: (callback, delayMs) => {
    const timeout = window.setTimeout(callback, delayMs);
    return () => {
      window.clearTimeout(timeout);
    };
  },
});

export class SyncService {
  private readonly online: OnlineMonitor;
  private readonly clock: () => string;
  private readonly scheduler: SyncScheduler;
  private readonly listeners = new Set<(snapshot: SyncStatus) => void>();
  private status: SyncStatus;
  private started = false;
  private generation = 0;
  private rerunRequested = false;
  private activeCycle?: Promise<void>;
  private unsubscribeMutations?: () => void;
  private cancelRetry?: () => void;

  private readonly handleOnline = (): void => {
    this.requestFlushInBackground();
  };

  private readonly handleOffline = (): void => {
    this.clearRetry();
    this.setStatus("waiting");
  };

  private readonly handleMutation = (): void => {
    if (this.activeCycle !== undefined) {
      this.rerunRequested = true;
      return;
    }
    this.requestFlushInBackground();
  };

  constructor(private readonly dependencies: SyncServiceDependencies) {
    this.online = dependencies.online ?? createBrowserOnlineMonitor();
    this.clock = dependencies.clock ?? (() => new Date().toISOString());
    this.scheduler = dependencies.scheduler ?? createBrowserScheduler();
    this.status = dependencies.gateway === undefined ? "paused" : "idle";
  }

  getSnapshot(): SyncStatus {
    return this.status;
  }

  subscribe(listener: (snapshot: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.generation += 1;
    this.online.addEventListener("online", this.handleOnline);
    this.online.addEventListener("offline", this.handleOffline);
    this.unsubscribeMutations =
      this.dependencies.repository.subscribeToMutations(this.handleMutation);
    this.requestFlushInBackground();
  }

  stop(): void {
    if (this.started) {
      this.online.removeEventListener("online", this.handleOnline);
      this.online.removeEventListener("offline", this.handleOffline);
      this.unsubscribeMutations?.();
      this.unsubscribeMutations = undefined;
    }

    this.started = false;
    this.generation += 1;
    this.rerunRequested = false;
    this.clearRetry();
  }

  requestFlush(): Promise<void> {
    if (this.dependencies.gateway === undefined) {
      this.setStatus("paused");
      return Promise.resolve();
    }
    if (!this.online.isOnline()) {
      this.setStatus("waiting");
      return Promise.resolve();
    }
    if (this.activeCycle !== undefined) {
      return this.activeCycle;
    }

    this.clearRetry();
    const cycleGeneration = this.generation;
    const activeCycle = Promise.resolve()
      .then(() => this.runRequestedCycles(cycleGeneration))
      .catch((error: unknown) => {
        if (this.isCurrent(cycleGeneration)) {
          this.handleCycleError(error);
        }
      });
    this.activeCycle = activeCycle;
    const clearActiveCycle = (): void => {
      if (this.activeCycle !== activeCycle) {
        return;
      }

      this.activeCycle = undefined;
      if (this.started && !this.isCurrent(cycleGeneration)) {
        this.requestFlushInBackground();
      }
    };
    void activeCycle.then(clearActiveCycle, clearActiveCycle);
    return activeCycle;
  }

  private async runRequestedCycles(generation: number): Promise<void> {
    let outcome: CycleOutcome;
    do {
      this.rerunRequested = false;
      outcome = await this.runCycle(generation);
    } while (outcome === "rerun" && this.isCurrent(generation));
  }

  private async runCycle(generation: number): Promise<CycleOutcome> {
    const gateway = this.dependencies.gateway;
    if (gateway === undefined) {
      if (this.isCurrent(generation)) {
        this.setStatus("paused");
      }
      return "complete";
    }
    if (!this.online.isOnline()) {
      if (this.isCurrent(generation)) {
        this.setStatus("waiting");
      }
      return "complete";
    }

    this.setStatus("syncing");
    try {
      await gateway.ensureSession();
      if (!this.isCurrent(generation)) {
        return "stopped";
      }
      if (this.waitIfOffline()) {
        return "complete";
      }

      const pushResult = await this.dependencies.outbox.flush();
      if (!this.isCurrent(generation)) {
        return "stopped";
      }
      if (this.waitIfOffline()) {
        return "complete";
      }
      if ("blockedUntil" in pushResult) {
        this.scheduleRetry(pushResult.blockedUntil, generation);
        this.setStatus(pushResult.failed === 1 ? "failed" : "waiting");
        return "complete";
      }
      if (this.rerunRequested) {
        return "rerun";
      }

      const cursor = await this.dependencies.repository.getSyncCursor();
      if (!this.isCurrent(generation)) {
        return "stopped";
      }
      if (this.waitIfOffline()) {
        return "complete";
      }
      if (this.rerunRequested) {
        return "rerun";
      }

      const pullResult = await gateway.pullSince(cursor);
      if (!this.isCurrent(generation)) {
        return "stopped";
      }
      if (this.waitIfOffline()) {
        return "complete";
      }
      if (this.rerunRequested) {
        return "rerun";
      }

      await this.dependencies.commitPull(pullResult);
      if (!this.isCurrent(generation)) {
        return "stopped";
      }
      if (this.waitIfOffline()) {
        return "complete";
      }
      if (this.rerunRequested) {
        return "rerun";
      }

      this.setStatus("idle");
      return "complete";
    } catch (error) {
      if (!this.isCurrent(generation)) {
        return "stopped";
      }
      this.handleCycleError(error);
      return "complete";
    }
  }

  private scheduleRetry(blockedUntil: string, generation: number): void {
    const now = timestampMillis(this.clock(), "clock");
    const blocked = timestampMillis(blockedUntil, "blocked until");
    const delayMs = Math.max(0, blocked - now);
    this.clearRetry();
    this.cancelRetry = this.scheduler.schedule(() => {
      if (!this.isCurrent(generation)) {
        return;
      }
      this.cancelRetry = undefined;
      this.requestFlushInBackground();
    }, delayMs);
  }

  private requestFlushInBackground(): void {
    void this.requestFlush().catch((error: unknown) => {
      this.handleCycleError(error);
    });
  }

  private handleCycleError(error: unknown): void {
    if (error instanceof CloudSessionPausedError) {
      this.clearRetry();
      this.setStatus("paused");
      return;
    }
    this.setStatus("failed");
  }

  private clearRetry(): void {
    this.cancelRetry?.();
    this.cancelRetry = undefined;
  }

  private isCurrent(generation: number): boolean {
    return this.generation === generation;
  }

  private waitIfOffline(): boolean {
    if (this.online.isOnline()) {
      return false;
    }
    this.setStatus("waiting");
    return true;
  }

  private setStatus(status: SyncStatus): void {
    if (this.status === status) {
      return;
    }

    this.status = status;
    const snapshot = this.status;
    for (const listener of [...this.listeners]) {
      try {
        listener(snapshot);
      } catch {
        // A broken observer cannot interrupt sync state transitions.
      }
    }
  }
}
