import type {
  CloudGateway,
  CloudPullResult,
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
  "getSyncCursor" | "setSyncCursor" | "subscribeToMutations"
>;

export interface OutboxFlusher {
  flush(): Promise<OutboxFlushResult>;
}

export interface OnlineMonitor {
  isOnline(): boolean;
  addEventListener(type: "online", listener: () => void): void;
  removeEventListener(type: "online", listener: () => void): void;
}

export interface SyncServiceDependencies {
  repository: SyncRepository;
  gateway?: CloudGateway;
  outbox: OutboxFlusher;
  applyPull(result: CloudPullResult): Promise<void>;
  online?: OnlineMonitor;
}

const createBrowserOnlineMonitor = (): OnlineMonitor => ({
  isOnline: () => navigator.onLine,
  addEventListener: (_type, listener) => {
    window.addEventListener("online", listener);
  },
  removeEventListener: (_type, listener) => {
    window.removeEventListener("online", listener);
  },
});

export class SyncService {
  private readonly online: OnlineMonitor;
  private readonly listeners = new Set<() => void>();
  private status: SyncStatus;
  private started = false;
  private applyingPull = false;
  private rerunRequested = false;
  private activeCycle?: Promise<void>;
  private unsubscribeMutations?: () => void;

  private readonly handleOnline = (): void => {
    void this.requestFlush();
  };

  private readonly handleMutation = (): void => {
    if (this.applyingPull) {
      return;
    }
    if (this.activeCycle !== undefined) {
      this.rerunRequested = true;
      return;
    }
    void this.requestFlush();
  };

  constructor(private readonly dependencies: SyncServiceDependencies) {
    this.online = dependencies.online ?? createBrowserOnlineMonitor();
    this.status = dependencies.gateway === undefined ? "paused" : "idle";
  }

  getSnapshot(): SyncStatus {
    return this.status;
  }

  subscribe(listener: () => void): () => void {
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
    this.online.addEventListener("online", this.handleOnline);
    this.unsubscribeMutations =
      this.dependencies.repository.subscribeToMutations(this.handleMutation);
    void this.requestFlush();
  }

  stop(): void {
    if (!this.started) {
      return;
    }

    this.started = false;
    this.rerunRequested = false;
    this.online.removeEventListener("online", this.handleOnline);
    this.unsubscribeMutations?.();
    this.unsubscribeMutations = undefined;
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

    const activeCycle = this.runRequestedCycles();
    this.activeCycle = activeCycle;
    const clearActiveCycle = (): void => {
      if (this.activeCycle === activeCycle) {
        this.activeCycle = undefined;
      }
    };
    void activeCycle.then(clearActiveCycle, clearActiveCycle);
    return activeCycle;
  }

  private async runRequestedCycles(): Promise<void> {
    do {
      this.rerunRequested = false;
      await this.runCycle();
    } while (
      this.rerunRequested &&
      this.started &&
      this.dependencies.gateway !== undefined &&
      this.online.isOnline()
    );
  }

  private async runCycle(): Promise<void> {
    const gateway = this.dependencies.gateway;
    if (gateway === undefined) {
      this.setStatus("paused");
      return;
    }
    if (!this.online.isOnline()) {
      this.setStatus("waiting");
      return;
    }

    this.setStatus("syncing");
    try {
      await gateway.ensureSession();
      const pushResult = await this.dependencies.outbox.flush();
      if (pushResult.failed > 0) {
        this.setStatus("failed");
        return;
      }

      const cursor = await this.dependencies.repository.getSyncCursor();
      const pullResult = await gateway.pullSince(cursor);
      this.applyingPull = true;
      try {
        await this.dependencies.applyPull(pullResult);
      } finally {
        this.applyingPull = false;
      }
      await this.dependencies.repository.setSyncCursor(pullResult.cursor);
      this.setStatus("idle");
    } catch {
      this.setStatus("failed");
    }
  }

  private setStatus(status: SyncStatus): void {
    if (this.status === status) {
      return;
    }

    this.status = status;
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
