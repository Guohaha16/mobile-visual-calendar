import { describe, expect, it } from "vitest";

import type {
  CloudGateway,
  CloudPullResult,
} from "../cloud/cloudGateway";
import type {
  OnlineMonitor,
  OutboxFlusher,
  SyncRepository,
} from "./syncService";
import { SyncService } from "./syncService";

const deferred = () => {
  let resolve = () => {};
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
};

class FakeOnlineMonitor implements OnlineMonitor {
  private readonly listeners = new Set<() => void>();
  addCount = 0;
  removeCount = 0;

  constructor(private online: boolean) {}

  isOnline(): boolean {
    return this.online;
  }

  addEventListener(_type: "online", listener: () => void): void {
    this.addCount += 1;
    this.listeners.add(listener);
  }

  removeEventListener(_type: "online", listener: () => void): void {
    this.removeCount += 1;
    this.listeners.delete(listener);
  }

  setOnline(online: boolean): void {
    this.online = online;
  }

  emitOnline(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}

class FakeSyncRepository implements SyncRepository {
  private readonly listeners = new Set<() => void>();
  cursor?: string;
  readonly calls: string[] = [];

  async getSyncCursor(): Promise<string | undefined> {
    this.calls.push("getCursor");
    return this.cursor;
  }

  async setSyncCursor(value: string): Promise<void> {
    this.calls.push(`setCursor:${value}`);
    this.cursor = value;
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
  readonly calls: string[] = [];
  results = [{ processed: 0, failed: 0 }];

  async flush(): Promise<{ processed: number; failed: number }> {
    this.calls.push("flush");
    const result = this.results.shift();
    if (result === undefined) {
      return { processed: 0, failed: 0 };
    }
    return result;
  }
}

class FakeGateway implements CloudGateway {
  ensureCalls = 0;
  activeSessions = 0;
  maxActiveSessions = 0;
  pullCalls: Array<string | undefined> = [];
  ensureGate?: Promise<void>;
  pullResult: CloudPullResult = {
    entries: [],
    cursor: "cursor-next",
  };

  async ensureSession(): Promise<{ userId: string }> {
    this.ensureCalls += 1;
    this.activeSessions += 1;
    this.maxActiveSessions = Math.max(
      this.maxActiveSessions,
      this.activeSessions,
    );
    await this.ensureGate;
    this.activeSessions -= 1;
    return { userId: "user-1" };
  }

  async pushCreate(): Promise<void> {}

  async pushDelete(): Promise<void> {}

  async pullSince(cursor?: string): Promise<CloudPullResult> {
    this.pullCalls.push(cursor);
    return this.pullResult;
  }
}

const createService = ({
  online = new FakeOnlineMonitor(true),
  repository = new FakeSyncRepository(),
  outbox = new FakeOutboxFlusher(),
  gateway = new FakeGateway(),
  applyPull = async () => {},
}: {
  online?: FakeOnlineMonitor;
  repository?: FakeSyncRepository;
  outbox?: FakeOutboxFlusher;
  gateway?: FakeGateway;
  applyPull?: (result: CloudPullResult) => Promise<void>;
} = {}) => ({
  online,
  repository,
  outbox,
  gateway,
  service: new SyncService({
    online,
    repository,
    outbox,
    gateway,
    applyPull,
  }),
});

describe("SyncService", () => {
  it("starts and cleans up online and mutation listeners", async () => {
    const online = new FakeOnlineMonitor(false);
    const context = createService({ online });

    context.service.start();

    expect(online.addCount).toBe(1);
    expect(context.repository.listenerCount).toBe(1);
    expect(context.service.getSnapshot()).toBe("waiting");
    expect(context.gateway.ensureCalls).toBe(0);

    online.setOnline(true);
    online.emitOnline();
    await context.service.requestFlush();

    expect(context.gateway.ensureCalls).toBe(1);
    expect(context.gateway.pullCalls).toEqual([undefined]);
    expect(context.service.getSnapshot()).toBe("idle");

    context.service.stop();
    expect(online.removeCount).toBe(1);
    expect(context.repository.listenerCount).toBe(0);

    online.emitOnline();
    context.repository.emitMutation();
    await Promise.resolve();
    expect(context.gateway.ensureCalls).toBe(1);
  });

  it("schedules repository mutations and coalesces simultaneous requests", async () => {
    const context = createService();
    const session = deferred();
    context.gateway.ensureGate = session.promise;

    const first = context.service.requestFlush();
    const second = context.service.requestFlush();

    expect(context.gateway.ensureCalls).toBe(1);
    expect(context.gateway.maxActiveSessions).toBe(1);
    session.resolve();
    await Promise.all([first, second]);
    expect(context.gateway.pullCalls).toHaveLength(1);

    context.gateway.ensureGate = undefined;
    context.service.start();
    await context.service.requestFlush();
    const callsBeforeMutation = context.gateway.ensureCalls;

    context.repository.emitMutation();
    await context.service.requestFlush();

    expect(context.gateway.ensureCalls).toBe(callsBeforeMutation + 1);
    expect(context.gateway.maxActiveSessions).toBe(1);
    context.service.stop();
  });

  it("pulls after a successful push, applies data, then advances the cursor", async () => {
    const repository = new FakeSyncRepository();
    repository.cursor = "cursor-old";
    const callOrder: string[] = [];
    const outbox: OutboxFlusher = {
      async flush() {
        callOrder.push("flush");
        return { processed: 2, failed: 0 };
      },
    };
    const gateway = new FakeGateway();
    gateway.pullSince = async (cursor?: string) => {
      callOrder.push(`pull:${cursor ?? "none"}`);
      return { entries: [], cursor: "cursor-new" };
    };
    repository.setSyncCursor = async (value: string) => {
      callOrder.push(`setCursor:${value}`);
      repository.cursor = value;
    };
    const service = new SyncService({
      repository,
      gateway,
      outbox,
      online: new FakeOnlineMonitor(true),
      applyPull: async (result) => {
        callOrder.push(`apply:${result.cursor}`);
      },
    });

    await service.requestFlush();

    expect(callOrder).toEqual([
      "flush",
      "pull:cursor-old",
      "apply:cursor-new",
      "setCursor:cursor-new",
    ]);
    expect(repository.cursor).toBe("cursor-new");
  });

  it("does not advance the cursor when applying a pull fails", async () => {
    const repository = new FakeSyncRepository();
    repository.cursor = "cursor-old";
    const context = createService({
      repository,
      applyPull: async () => {
        throw new Error("apply failed");
      },
    });

    await context.service.requestFlush();

    expect(repository.cursor).toBe("cursor-old");
    expect(context.service.getSnapshot()).toBe("failed");
  });

  it("does not pull after a failed push and can retry on request", async () => {
    const outbox = new FakeOutboxFlusher();
    outbox.results = [
      { processed: 0, failed: 1 },
      { processed: 1, failed: 0 },
    ];
    const context = createService({ outbox });
    const observed: string[] = [];
    const unsubscribe = context.service.subscribe(() => {
      observed.push(context.service.getSnapshot());
    });

    await context.service.requestFlush();

    expect(context.service.getSnapshot()).toBe("failed");
    expect(context.gateway.pullCalls).toEqual([]);

    await context.service.requestFlush();

    expect(context.service.getSnapshot()).toBe("idle");
    expect(context.gateway.pullCalls).toEqual([undefined]);
    expect(observed).toContain("syncing");
    expect(observed).toContain("failed");
    unsubscribe();
  });
});
