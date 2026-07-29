import { describe, expect, it, vi } from "vitest";

import {
  CloudSessionPausedError,
  type CloudGateway,
  type CloudPullResult,
} from "../cloud/cloudGateway";
import {
  OutboxLeaseRecoveryError,
  type OutboxFlushResult,
} from "./outbox";
import {
  SyncService,
  type OnlineMonitor,
  type OutboxFlusher,
  type SyncRepository,
  type SyncScheduler,
} from "./syncService";

const deferred = () => {
  let resolve = () => {};
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
};

class FakeOnlineMonitor implements OnlineMonitor {
  private readonly listeners = {
    online: new Set<() => void>(),
    offline: new Set<() => void>(),
  };
  readonly added: Array<"online" | "offline"> = [];
  readonly removed: Array<"online" | "offline"> = [];

  constructor(private online: boolean) {}

  isOnline(): boolean {
    return this.online;
  }

  addEventListener(
    type: "online" | "offline",
    listener: () => void,
  ): void {
    this.added.push(type);
    this.listeners[type].add(listener);
  }

  removeEventListener(
    type: "online" | "offline",
    listener: () => void,
  ): void {
    this.removed.push(type);
    this.listeners[type].delete(listener);
  }

  setOnline(online: boolean): void {
    this.online = online;
  }

  emit(type: "online" | "offline"): void {
    for (const listener of [...this.listeners[type]]) {
      listener();
    }
  }
}

class FakeSyncRepository implements SyncRepository {
  private readonly listeners = new Set<() => void>();
  cursor?: string;
  getCursorCalls = 0;

  async getSyncCursor(): Promise<string | undefined> {
    this.getCursorCalls += 1;
    return this.cursor;
  }

  subscribeToMutations(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emitMutation(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

class FakeOutboxFlusher implements OutboxFlusher {
  flushCalls = 0;
  activeFlushes = 0;
  maxActiveFlushes = 0;
  results: OutboxFlushResult[] = [{ processed: 0, failed: 0 }];
  failures: Error[] = [];
  gate?: Promise<void>;
  onFlush?: (call: number) => void;

  async flush(): Promise<OutboxFlushResult> {
    this.flushCalls += 1;
    this.activeFlushes += 1;
    this.maxActiveFlushes = Math.max(
      this.maxActiveFlushes,
      this.activeFlushes,
    );
    this.onFlush?.(this.flushCalls);
    try {
      await this.gate;
      const failure = this.failures.shift();
      if (failure !== undefined) {
        throw failure;
      }
      return this.results.shift() ?? { processed: 0, failed: 0 };
    } finally {
      this.activeFlushes -= 1;
    }
  }
}

class FakeGateway implements CloudGateway {
  ensureCalls = 0;
  ensureError?: Error;
  pullCalls: Array<string | undefined> = [];
  pullResults: CloudPullResult[] = [
    { entries: [], cursor: "cursor-next" },
  ];
  pullGate?: Promise<void>;
  onPull?: (call: number) => void;

  async ensureSession(): Promise<{ userId: string }> {
    this.ensureCalls += 1;
    if (this.ensureError !== undefined) {
      throw this.ensureError;
    }
    return { userId: "user-1" };
  }

  async pushCreate(entryId: string, operationId: string): Promise<void> {
    void entryId;
    void operationId;
  }

  async pushDelete(
    entryId: string,
    deletedAt: string,
    operationId: string,
  ): Promise<void> {
    void entryId;
    void deletedAt;
    void operationId;
  }

  async pushPreference(): Promise<void> {}

  async pullSince(cursor?: string): Promise<CloudPullResult> {
    this.pullCalls.push(cursor);
    this.onPull?.(this.pullCalls.length);
    await this.pullGate;
    return (
      this.pullResults.shift() ?? {
        entries: [],
        cursor: `cursor-${this.pullCalls.length}`,
      }
    );
  }
}

interface ScheduledTask {
  callback: () => void;
  delayMs: number;
  cancelled: boolean;
}

class FakeScheduler implements SyncScheduler {
  readonly tasks: ScheduledTask[] = [];

  schedule(callback: () => void, delayMs: number): () => void {
    const task: ScheduledTask = {
      callback,
      delayMs,
      cancelled: false,
    };
    this.tasks.push(task);
    return () => {
      task.cancelled = true;
    };
  }

  runNext(): void {
    const task = this.tasks.find((candidate) => !candidate.cancelled);
    if (task === undefined) {
      throw new Error("No scheduled task");
    }
    task.cancelled = true;
    task.callback();
  }

  get pendingDelays(): number[] {
    return this.tasks
      .filter((task) => !task.cancelled)
      .map((task) => task.delayMs);
  }
}

const createLeaseRecoveryError = (
  blockedUntil = "2026-07-30T10:00:30.000Z",
): OutboxLeaseRecoveryError =>
  new OutboxLeaseRecoveryError(
    "operation-1",
    blockedUntil,
    new Error("remote failed"),
    new Error("retry persistence failed"),
  );

const createService = ({
  online = new FakeOnlineMonitor(true),
  repository = new FakeSyncRepository(),
  outbox = new FakeOutboxFlusher(),
  gateway = new FakeGateway(),
  scheduler = new FakeScheduler(),
  time = { now: "2026-07-30T10:00:00.000Z" },
  commitPull,
}: {
  online?: FakeOnlineMonitor;
  repository?: FakeSyncRepository;
  outbox?: FakeOutboxFlusher;
  gateway?: FakeGateway;
  scheduler?: FakeScheduler;
  time?: { now: string };
  commitPull?: (result: CloudPullResult) => Promise<void>;
} = {}) => {
  const commits: CloudPullResult[] = [];
  const commit =
    commitPull ??
    (async (result: CloudPullResult) => {
      commits.push(result);
      repository.cursor = result.cursor;
    });

  return {
    online,
    repository,
    outbox,
    gateway,
    scheduler,
    time,
    commits,
    service: new SyncService({
      online,
      repository,
      outbox,
      gateway,
      scheduler,
      clock: () => time.now,
      commitPull: commit,
    }),
  };
};

describe("SyncService", () => {
  it("provides a typed paused-session error", () => {
    const error = new CloudSessionPausedError("Sign in required");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("CloudSessionPausedError");
    expect(error.message).toBe("Sign in required");
  });

  it("observes online and offline once and cleans up both listeners", async () => {
    const online = new FakeOnlineMonitor(false);
    const context = createService({ online });

    context.service.start();
    context.service.start();

    expect(online.added).toEqual(["online", "offline"]);
    expect(context.repository.listenerCount).toBe(1);
    expect(context.service.getSnapshot()).toBe("waiting");
    expect(context.gateway.ensureCalls).toBe(0);

    online.setOnline(true);
    online.emit("online");
    await context.service.requestFlush();
    expect(context.service.getSnapshot()).toBe("idle");

    online.setOnline(false);
    online.emit("offline");
    expect(context.service.getSnapshot()).toBe("waiting");

    context.service.stop();
    context.service.stop();
    expect(online.removed).toEqual(["online", "offline"]);
    expect(context.repository.listenerCount).toBe(0);

    const ensureCalls = context.gateway.ensureCalls;
    online.setOnline(true);
    online.emit("online");
    context.repository.emitMutation();
    await Promise.resolve();
    expect(context.gateway.ensureCalls).toBe(ensureCalls);
  });

  it("waits without pulling and retries pending work at blockedUntil", async () => {
    const context = createService();
    context.outbox.results = [
      {
        processed: 0,
        failed: 0,
        pending: true,
        blockedUntil: "2026-07-30T10:00:02.000Z",
      },
      { processed: 1, failed: 0 },
    ];

    context.service.start();
    await context.service.requestFlush();

    expect(context.service.getSnapshot()).toBe("waiting");
    expect(context.gateway.pullCalls).toEqual([]);
    expect(context.scheduler.pendingDelays).toEqual([2_000]);

    context.time.now = "2026-07-30T10:00:02.000Z";
    context.scheduler.runNext();
    await context.service.requestFlush();

    expect(context.gateway.pullCalls).toEqual([undefined]);
    expect(context.commits).toMatchObject([{ cursor: "cursor-next" }]);
    expect(context.service.getSnapshot()).toBe("idle");
    context.service.stop();
  });

  it("reports a failed deferred push and schedules its retry", async () => {
    const context = createService();
    context.outbox.results = [
      {
        processed: 0,
        failed: 1,
        blockedUntil: "2026-07-30T10:00:16.000Z",
      },
    ];

    context.service.start();
    await context.service.requestFlush();

    expect(context.service.getSnapshot()).toBe("failed");
    expect(context.gateway.pullCalls).toEqual([]);
    expect(context.scheduler.pendingDelays).toEqual([16_000]);
    context.service.stop();
  });

  it("retries a lease recovery error when its timer fires", async () => {
    const context = createService();
    context.outbox.failures = [createLeaseRecoveryError()];
    context.outbox.results = [{ processed: 1, failed: 0 }];
    let emittedMutation = false;
    context.service.subscribe((snapshot) => {
      if (snapshot === "failed" && !emittedMutation) {
        emittedMutation = true;
        context.repository.emitMutation();
      }
    });

    context.service.start();
    await context.service.requestFlush();

    expect(context.service.getSnapshot()).toBe("failed");
    expect(context.gateway.pullCalls).toEqual([]);
    expect(context.scheduler.pendingDelays).toEqual([30_000]);

    context.time.now = "2026-07-30T10:00:30.000Z";
    context.scheduler.runNext();
    await context.service.requestFlush();

    expect(context.outbox.flushCalls).toBe(2);
    expect(context.gateway.pullCalls).toEqual([undefined]);
    expect(context.service.getSnapshot()).toBe("idle");
    context.service.stop();
  });

  it("maps paused sessions and a missing gateway without touching the outbox", async () => {
    const paused = createService();
    paused.gateway.ensureError = new CloudSessionPausedError(
      "Session disabled",
    );

    await paused.service.requestFlush();

    expect(paused.service.getSnapshot()).toBe("paused");
    expect(paused.outbox.flushCalls).toBe(0);

    const repository = new FakeSyncRepository();
    const outbox = new FakeOutboxFlusher();
    const service = new SyncService({
      repository,
      outbox,
      gateway: undefined,
      online: new FakeOnlineMonitor(true),
      scheduler: new FakeScheduler(),
      clock: () => "2026-07-30T10:00:00.000Z",
      commitPull: async () => {},
    });

    await service.requestFlush();

    expect(service.getSnapshot()).toBe("paused");
    expect(outbox.flushCalls).toBe(0);
  });

  it("isolates status subscriber failures and passes each snapshot", async () => {
    const context = createService();
    const snapshots: string[] = [];
    context.service.subscribe(() => {
      throw new Error("listener failed");
    });
    context.service.subscribe((snapshot) => {
      snapshots.push(snapshot);
    });

    await expect(context.service.requestFlush()).resolves.toBeUndefined();

    expect(snapshots).toEqual(["syncing", "idle"]);
  });

  it("installs the cycle guard before syncing subscribers can enqueue work", async () => {
    const repository = new FakeSyncRepository();
    const outbox = new FakeOutboxFlusher();
    const context = createService({ repository, outbox });
    let emittedMutation = false;
    context.service.subscribe((snapshot) => {
      if (snapshot === "syncing" && !emittedMutation) {
        emittedMutation = true;
        repository.emitMutation();
      }
    });

    context.service.start();
    await context.service.requestFlush();

    expect(outbox.flushCalls).toBe(2);
    expect(outbox.maxActiveFlushes).toBe(1);
    expect(context.gateway.pullCalls).toHaveLength(1);
    context.service.stop();
  });

  it("runs another push pass when idle publication causes a mutation", async () => {
    const repository = new FakeSyncRepository();
    const outbox = new FakeOutboxFlusher();
    const context = createService({ repository, outbox });
    let emittedMutation = false;
    context.service.subscribe((snapshot) => {
      if (snapshot === "idle" && !emittedMutation) {
        emittedMutation = true;
        repository.emitMutation();
      }
    });

    context.service.start();
    await context.service.requestFlush();
    await vi.waitFor(() => {
      expect(outbox.flushCalls).toBe(2);
    });

    expect(outbox.flushCalls).toBe(2);
    expect(context.gateway.pullCalls).toHaveLength(2);
    expect(context.commits).toHaveLength(2);
    context.service.stop();
  });

  it("drains mutations raised during push, pull, and commit without losing work", async () => {
    const repository = new FakeSyncRepository();
    repository.cursor = "cursor-old";
    const outbox = new FakeOutboxFlusher();
    const gateway = new FakeGateway();
    gateway.pullResults = [
      { entries: [], cursor: "cursor-a" },
      { entries: [], cursor: "cursor-b" },
      { entries: [], cursor: "cursor-c" },
    ];
    const commits: string[] = [];
    outbox.onFlush = (call) => {
      if (call === 1) {
        repository.emitMutation();
      }
    };
    gateway.onPull = (call) => {
      if (call === 1) {
        repository.emitMutation();
      }
    };
    const context = createService({
      repository,
      outbox,
      gateway,
      commitPull: async (result) => {
        commits.push(result.cursor);
        repository.cursor = result.cursor;
        if (commits.length === 1) {
          repository.emitMutation();
        }
      },
    });

    context.service.start();
    await context.service.requestFlush();

    expect(outbox.flushCalls).toBe(4);
    expect(gateway.pullCalls).toEqual([
      "cursor-old",
      "cursor-old",
      "cursor-b",
    ]);
    expect(commits).toEqual(["cursor-b", "cursor-c"]);
    expect(repository.cursor).toBe("cursor-c");
    expect(context.service.getSnapshot()).toBe("idle");
    context.service.stop();
  });

  it("safely replays a pull after an atomic commit failure", async () => {
    const repository = new FakeSyncRepository();
    repository.cursor = "cursor-old";
    const gateway = new FakeGateway();
    const result = { entries: [], cursor: "cursor-replay" };
    gateway.pullResults = [result, result];
    const commitAttempts: string[] = [];
    const effectiveApplications: string[] = [];
    let failCommit = true;
    const context = createService({
      repository,
      gateway,
      commitPull: async (pullResult) => {
        commitAttempts.push(pullResult.cursor);
        if (failCommit) {
          failCommit = false;
          throw new Error("atomic commit rolled back");
        }
        effectiveApplications.push(pullResult.cursor);
        repository.cursor = pullResult.cursor;
      },
    });

    await context.service.requestFlush();
    expect(context.service.getSnapshot()).toBe("failed");
    expect(repository.cursor).toBe("cursor-old");

    await context.service.requestFlush();

    expect(gateway.pullCalls).toEqual(["cursor-old", "cursor-old"]);
    expect(commitAttempts).toEqual(["cursor-replay", "cursor-replay"]);
    expect(effectiveApplications).toEqual(["cursor-replay"]);
    expect(repository.cursor).toBe("cursor-replay");
    expect(context.service.getSnapshot()).toBe("idle");
  });

  it("cancels a deferred retry when stopped", async () => {
    const context = createService();
    context.outbox.failures = [createLeaseRecoveryError()];
    context.service.start();
    await context.service.requestFlush();
    expect(context.scheduler.pendingDelays).toEqual([30_000]);

    context.service.stop();

    expect(context.scheduler.pendingDelays).toEqual([]);
    expect(() => context.scheduler.runNext()).toThrow("No scheduled task");
  });

  it("cancels a lease recovery retry when connectivity goes offline", async () => {
    const online = new FakeOnlineMonitor(true);
    const context = createService({ online });
    context.outbox.failures = [createLeaseRecoveryError()];
    context.service.start();
    await context.service.requestFlush();
    expect(context.scheduler.pendingDelays).toEqual([30_000]);

    online.setOnline(false);
    online.emit("offline");

    expect(context.service.getSnapshot()).toBe("waiting");
    expect(context.scheduler.pendingDelays).toEqual([]);
    expect(() => context.scheduler.runNext()).toThrow("No scheduled task");
    context.service.stop();
  });

  it("does not pull or publish a final status when stopped during a push", async () => {
    const context = createService();
    const push = deferred();
    context.outbox.gate = push.promise;
    const snapshots: string[] = [];
    context.service.subscribe((snapshot) => {
      snapshots.push(snapshot);
    });
    context.service.start();
    await vi.waitFor(() => {
      expect(context.outbox.flushCalls).toBe(1);
    });

    context.service.stop();
    push.resolve();
    await context.service.requestFlush();

    expect(context.gateway.pullCalls).toEqual([]);
    expect(context.commits).toEqual([]);
    expect(snapshots).toEqual(["syncing"]);
  });

  it("does not pull or report idle when connectivity drops during a push", async () => {
    const online = new FakeOnlineMonitor(true);
    const context = createService({ online });
    const push = deferred();
    context.outbox.gate = push.promise;
    context.service.start();
    await vi.waitFor(() => {
      expect(context.outbox.flushCalls).toBe(1);
    });
    const activeCycle = context.service.requestFlush();

    online.setOnline(false);
    online.emit("offline");
    push.resolve();
    await activeCycle;

    expect(context.gateway.pullCalls).toEqual([]);
    expect(context.commits).toEqual([]);
    expect(context.service.getSnapshot()).toBe("waiting");
    context.service.stop();
  });

  it("does not commit or publish a final status when stopped during a pull", async () => {
    const context = createService();
    const pull = deferred();
    context.gateway.pullGate = pull.promise;
    const snapshots: string[] = [];
    context.service.subscribe((snapshot) => {
      snapshots.push(snapshot);
    });
    context.service.start();
    await vi.waitFor(() => {
      expect(context.gateway.pullCalls).toHaveLength(1);
    });

    context.service.stop();
    pull.resolve();
    await context.service.requestFlush();

    expect(context.commits).toEqual([]);
    expect(snapshots).toEqual(["syncing"]);
  });
});
