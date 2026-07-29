import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type {
  DiaryEntry,
  MediaAsset,
  StoredPreference,
} from "../../domain/types";
import type { MediaStoragePathUpdate } from "../local/diaryRepository";
import { CloudSessionPausedError } from "./cloudGateway";
import { createSupabaseClient } from "./supabaseClient";
import {
  createBrowserThumbnail,
  SupabaseGateway,
  type SupabaseApplyCreateRequest,
  type SupabaseApplyDeleteRequest,
  type SupabaseApplyDeleteResult,
  type SupabaseApplyPreferenceRequest,
  type SupabaseGatewayAdapter,
  type SupabaseSnapshot,
} from "./supabaseGateway";

const entry: DiaryEntry = {
  id: "entry-1",
  userId: "anonymous-user",
  entryDate: "2026-07-30",
  text: "Cloud diary",
  createdAt: "2026-07-30T08:00:00.000Z",
  updatedAt: "2026-07-30T08:00:00.000Z",
  media: [],
  syncState: "waiting",
};

const media: MediaAsset = {
  id: "media-1",
  entryId: entry.id,
  userId: entry.userId,
  mimeType: "image/png",
  width: 1200,
  height: 900,
  sortOrder: 0,
  createdAt: entry.createdAt,
  localBlob: new Blob(["image"], { type: "image/png" }),
};

class FakeRepository {
  entry: DiaryEntry | undefined = entry;
  media: MediaAsset[] = [media];
  readonly metadataUpdates: MediaStoragePathUpdate[][] = [];
  readonly metadataFailures: Error[] = [];

  constructor(private readonly events: string[]) {}

  async getEntry(id: string): Promise<DiaryEntry | undefined> {
    return this.entry?.id === id ? this.entry : undefined;
  }

  async listMediaForEntry(entryId: string): Promise<MediaAsset[]> {
    return this.media.filter((asset) => asset.entryId === entryId);
  }

  async updateMediaStoragePaths(
    updates: readonly MediaStoragePathUpdate[],
  ): Promise<void> {
    this.events.push("persist-storage-paths");
    this.metadataUpdates.push([...updates]);
    const failure = this.metadataFailures.shift();
    if (failure !== undefined) {
      throw failure;
    }
    const byId = new Map(updates.map((update) => [update.id, update.storagePath]));
    this.media = this.media.map((asset) => {
      const storagePath = byId.get(asset.id);
      return storagePath === undefined ? asset : { ...asset, storagePath };
    });
  }
}

class FakeSupabaseAdapter implements SupabaseGatewayAdapter {
  sessionUserId?: string;
  anonymousUserId: string | null = "anonymous-user";
  signInCalls = 0;
  readonly completedOperations = new Set<string>();
  readonly operationChecks: string[] = [];
  readonly uploads: Array<{
    bucket: string;
    path: string;
    body: Blob;
    options: { contentType: string; upsert: boolean };
  }> = [];
  readonly applyCreates: SupabaseApplyCreateRequest[] = [];
  readonly applyDeletes: SupabaseApplyDeleteRequest[] = [];
  readonly applyPreferences: SupabaseApplyPreferenceRequest[] = [];
  readonly removals: Array<{ bucket: string; paths: string[] }> = [];
  readonly downloads: Array<{ bucket: string; path: string }> = [];
  readonly snapshotCursors: Array<string | undefined> = [];
  readonly blobs = new Map<string, Blob>();
  snapshot: SupabaseSnapshot = {
    entries: [],
    media: [],
    preference: null,
    cursor: "server-cursor-empty",
  };
  deleteStoragePaths: string[] = [];
  uploadError?: Error;
  applyCreateError?: Error;
  applyDeleteError?: Error;
  snapshotError?: Error;
  downloadError?: Error;

  constructor(private readonly events: string[]) {}

  async getSessionUser(): Promise<string | undefined> {
    this.events.push("get-session");
    return this.sessionUserId;
  }

  async signInAnonymously(): Promise<string | undefined> {
    this.events.push("sign-in");
    this.signInCalls += 1;
    return this.anonymousUserId ?? undefined;
  }

  async isOperationCompleted(operationId: string): Promise<boolean> {
    this.events.push(`check:${operationId}`);
    this.operationChecks.push(operationId);
    return this.completedOperations.has(operationId);
  }

  async upload(
    bucket: string,
    path: string,
    body: Blob,
    options: { contentType: string; upsert: boolean },
  ): Promise<void> {
    this.events.push(`upload:${path}`);
    if (this.uploadError !== undefined) {
      throw this.uploadError;
    }
    this.uploads.push({ bucket, path, body, options });
  }

  async applyCreate(
    request: SupabaseApplyCreateRequest,
  ): Promise<{ alreadyApplied: boolean }> {
    this.events.push(`apply-create:${request.operationId}`);
    if (this.applyCreateError !== undefined) {
      throw this.applyCreateError;
    }
    this.applyCreates.push(request);
    const alreadyApplied = this.completedOperations.has(request.operationId);
    this.completedOperations.add(request.operationId);
    return { alreadyApplied };
  }

  async applyDelete(
    request: SupabaseApplyDeleteRequest,
  ): Promise<SupabaseApplyDeleteResult> {
    this.events.push(`apply-delete:${request.operationId}`);
    if (this.applyDeleteError !== undefined) {
      throw this.applyDeleteError;
    }
    this.applyDeletes.push(request);
    const alreadyApplied = this.completedOperations.has(request.operationId);
    this.completedOperations.add(request.operationId);
    return {
      alreadyApplied,
      storagePaths: [...this.deleteStoragePaths],
    };
  }

  async applyPreference(
    request: SupabaseApplyPreferenceRequest,
  ): Promise<{ alreadyApplied: boolean }> {
    this.events.push(`apply-preference:${request.operationId}`);
    this.applyPreferences.push(request);
    const alreadyApplied = this.completedOperations.has(request.operationId);
    this.completedOperations.add(request.operationId);
    return { alreadyApplied };
  }

  async getSnapshot(cursor?: string): Promise<SupabaseSnapshot> {
    this.events.push("snapshot");
    if (this.snapshotError !== undefined) {
      throw this.snapshotError;
    }
    this.snapshotCursors.push(cursor);
    return this.snapshot;
  }

  async remove(bucket: string, paths: string[]): Promise<void> {
    this.events.push(`remove:${paths.join(",")}`);
    this.removals.push({ bucket, paths });
  }

  async download(bucket: string, path: string): Promise<Blob> {
    this.events.push(`download:${path}`);
    if (this.downloadError !== undefined) {
      throw this.downloadError;
    }
    this.downloads.push({ bucket, path });
    const blob = this.blobs.get(path);
    if (blob === undefined) {
      throw new Error(`Missing fake blob: ${path}`);
    }
    return blob;
  }
}

const createContext = () => {
  const events: string[] = [];
  const adapter = new FakeSupabaseAdapter(events);
  const repository = new FakeRepository(events);
  const createThumbnail = vi.fn(async (blob: Blob) =>
    new Blob([await blob.text(), "-thumbnail"], { type: "image/webp" }),
  );
  const gateway = new SupabaseGateway({
    adapter,
    repository,
    createThumbnail,
  });
  return { adapter, createThumbnail, events, gateway, repository };
};

describe("createSupabaseClient", () => {
  it("returns undefined unless both browser environment values are present", () => {
    const factory = vi.fn();

    expect(
      createSupabaseClient({
        env: {
          VITE_SUPABASE_URL: "",
          VITE_SUPABASE_ANON_KEY: "anon-key",
        },
        factory,
      }),
    ).toBeUndefined();
    expect(
      createSupabaseClient({
        env: {
          VITE_SUPABASE_URL: "https://project.supabase.co",
        },
        factory,
      }),
    ).toBeUndefined();
    expect(factory).not.toHaveBeenCalled();
  });

  it("uses the Supabase factory with persisted browser session settings", () => {
    const client = { marker: "client" } as unknown as SupabaseClient;
    const factory = vi.fn(() => client);

    expect(
      createSupabaseClient({
        env: {
          VITE_SUPABASE_URL: "https://project.supabase.co",
          VITE_SUPABASE_ANON_KEY: "anon-key",
        },
        factory,
      }),
    ).toBe(client);
    expect(factory).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "anon-key",
      {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
        },
      },
    );
  });
});

describe("SupabaseGateway sessions", () => {
  it("returns the anonymous user and signs in exactly once", async () => {
    const { adapter, gateway } = createContext();

    await expect(gateway.ensureSession()).resolves.toEqual({
      userId: "anonymous-user",
    });
    await expect(gateway.ensureSession()).resolves.toEqual({
      userId: "anonymous-user",
    });
    expect(adapter.signInCalls).toBe(1);
  });

  it("uses the current session without anonymous sign-in", async () => {
    const { adapter, gateway } = createContext();
    adapter.sessionUserId = "existing-user";

    await expect(gateway.ensureSession()).resolves.toEqual({
      userId: "existing-user",
    });
    expect(adapter.signInCalls).toBe(0);
  });

  it("pauses when Supabase is absent or anonymous auth returns no valid user", async () => {
    const invalid = createContext();
    invalid.adapter.anonymousUserId = null;

    await expect(
      new SupabaseGateway({
        adapter: undefined,
        repository: invalid.repository,
        createThumbnail: invalid.createThumbnail,
      }).ensureSession(),
    ).rejects.toBeInstanceOf(CloudSessionPausedError);
    await expect(invalid.gateway.ensureSession()).rejects.toBeInstanceOf(
      CloudSessionPausedError,
    );
  });
});

describe("SupabaseGateway pushes", () => {
  it("uses the operation ledger to skip sequential replay uploads and DB application", async () => {
    const { adapter, events, gateway, repository } = createContext();

    await gateway.pushCreate("entry-1", "operation-create");
    await gateway.pushCreate("entry-1", "operation-create");

    expect(adapter.uploads).toHaveLength(1);
    expect(adapter.uploads[0]).toMatchObject({
      bucket: "diary-images",
      path: "anonymous-user/2026/07/media-1.png",
      options: { contentType: "image/png", upsert: true },
    });
    expect(adapter.applyCreates).toEqual([
      {
        operationId: "operation-create",
        entry: {
          id: "entry-1",
          entry_date: "2026-07-30",
          text: "Cloud diary",
          created_at: "2026-07-30T08:00:00.000Z",
          updated_at: "2026-07-30T08:00:00.000Z",
          deleted_at: null,
        },
        media: [
          {
            id: "media-1",
            entry_id: "entry-1",
            storage_path: "anonymous-user/2026/07/media-1.png",
            mime_type: "image/png",
            width: 1200,
            height: 900,
            sort_order: 0,
            created_at: "2026-07-30T08:00:00.000Z",
            updated_at: "2026-07-30T08:00:00.000Z",
            deleted_at: null,
          },
        ],
      },
    ]);
    expect(repository.metadataUpdates).toEqual([
      [
        {
          id: "media-1",
          storagePath: "anonymous-user/2026/07/media-1.png",
        },
      ],
    ]);
    expect(events).toEqual([
      "get-session",
      "sign-in",
      "check:operation-create",
      "upload:anonymous-user/2026/07/media-1.png",
      "apply-create:operation-create",
      "persist-storage-paths",
      "check:operation-create",
    ]);
  });

  it("retries only local metadata when the RPC completed before persistence failed", async () => {
    const context = createContext();
    const persistenceFailure = new Error("IndexedDB unavailable");
    context.repository.metadataFailures.push(persistenceFailure);

    await expect(
      context.gateway.pushCreate("entry-1", "operation-create"),
    ).rejects.toBe(persistenceFailure);
    await expect(
      context.gateway.pushCreate("entry-1", "operation-create"),
    ).resolves.toBeUndefined();

    expect(context.adapter.uploads).toHaveLength(1);
    expect(context.adapter.applyCreates).toHaveLength(1);
    expect(context.repository.metadataUpdates).toHaveLength(2);
  });

  it("does not apply metadata or persist paths after a failed upload", async () => {
    const context = createContext();
    const failure = new Error("upload unavailable");
    context.adapter.uploadError = failure;

    await expect(
      context.gateway.pushCreate("entry-1", "operation-create"),
    ).rejects.toBe(failure);
    expect(context.adapter.applyCreates).toEqual([]);
    expect(context.repository.metadataUpdates).toEqual([]);
  });

  it("applies the exact tombstone before removing only owned paths", async () => {
    const context = createContext();
    context.repository.media = [
      {
        ...media,
        storagePath: "anonymous-user/2026/07/local.png",
      },
    ];
    context.adapter.deleteStoragePaths = [
      "anonymous-user/2026/07/remote.png",
      "other-user/2026/07/not-owned.png",
    ];
    const deletedAt = "2026-07-29T12:00:00.000Z";

    await context.gateway.pushDelete(
      "entry-1",
      deletedAt,
      "operation-delete",
    );

    expect(context.adapter.applyDeletes).toEqual([
      {
        operationId: "operation-delete",
        entryId: "entry-1",
        deletedAt,
      },
    ]);
    expect(context.adapter.removals).toEqual([
      {
        bucket: "diary-images",
        paths: [
          "anonymous-user/2026/07/local.png",
          "anonymous-user/2026/07/remote.png",
        ],
      },
    ]);
    expect(context.events.indexOf("apply-delete:operation-delete")).toBeLessThan(
      context.events.findIndex((event) => event.startsWith("remove:")),
    );
  });

  it("applies a complete preference snapshot with its exact timestamp", async () => {
    const context = createContext();
    const preference: StoredPreference = {
      key: "background",
      value: { mode: "pinned", pinnedAssetId: "media-1" },
      updatedAt: "2026-07-30T10:11:12.000Z",
    };

    await context.gateway.pushPreference(
      preference,
      "operation-preference",
    );

    expect(context.adapter.applyPreferences).toEqual([
      {
        operationId: "operation-preference",
        mode: "pinned",
        pinnedAssetId: "media-1",
        updatedAt: "2026-07-30T10:11:12.000Z",
      },
    ]);
  });
});

describe("SupabaseGateway snapshot pulls", () => {
  it("maps the complete snapshot, tombstones, private blobs, thumbnails, and server cursor", async () => {
    const context = createContext();
    const localBlob = new Blob(["private"], { type: "image/png" });
    context.adapter.snapshot = {
      entries: [
        {
          id: "entry-deleted",
          user_id: "anonymous-user",
          entry_date: "2026-07-29",
          text: "Deleted",
          created_at: "2026-07-29T08:00:00.000Z",
          updated_at: "2026-07-30T10:03:00.000Z",
          deleted_at: "2026-07-30T10:03:00.000Z",
        },
        {
          id: "entry-active",
          user_id: "anonymous-user",
          entry_date: "2026-07-30",
          text: "Active",
          created_at: "2026-07-30T08:00:00.000Z",
          updated_at: "2026-07-30T10:02:00.000Z",
          deleted_at: null,
        },
      ],
      media: [
        {
          id: "media-remote",
          user_id: "anonymous-user",
          entry_id: "entry-active",
          storage_path: "anonymous-user/2026/07/media-remote.png",
          mime_type: "image/png",
          width: 640,
          height: 480,
          sort_order: 0,
          created_at: "2026-07-30T08:00:00.000Z",
          updated_at: "2026-07-30T08:00:00.000Z",
          deleted_at: null,
        },
      ],
      preference: {
        user_id: "anonymous-user",
        background_mode: "pinned",
        pinned_background_asset_id: "media-remote",
        updated_at: "2026-07-30T10:04:00.000Z",
      },
      cursor: "2026-08-01T00:00:00.000Z",
    };
    context.adapter.blobs.set(
      "anonymous-user/2026/07/media-remote.png",
      localBlob,
    );

    const result = await context.gateway.pullSince(
      "2026-07-31T00:00:00.000Z",
    );

    expect(context.adapter.snapshotCursors).toEqual([
      "2026-07-31T00:00:00.000Z",
    ]);
    expect(context.adapter.downloads).toEqual([
      {
        bucket: "diary-images",
        path: "anonymous-user/2026/07/media-remote.png",
      },
    ]);
    expect(context.createThumbnail).toHaveBeenCalledWith(
      localBlob,
      "image/png",
    );
    expect(result.cursor).toBe("2026-08-01T00:00:00.000Z");
    expect(result.preferences).toEqual({
      key: "background",
      value: { mode: "pinned", pinnedAssetId: "media-remote" },
      updatedAt: "2026-07-30T10:04:00.000Z",
    });
    expect(result.entries).toMatchObject([
      {
        id: "entry-active",
        media: [
          {
            id: "media-remote",
            localBlob,
            thumbnailBlob: expect.any(Blob),
          },
        ],
      },
      {
        id: "entry-deleted",
        deletedAt: "2026-07-30T10:03:00.000Z",
        media: [],
      },
    ]);
    expect(
      await result.entries[0]?.media[0]?.thumbnailBlob?.text(),
    ).toBe("private-thumbnail");
  });

  it("returns the stable server cursor from an empty snapshot", async () => {
    const context = createContext();
    context.adapter.snapshot.cursor = "server-high-water";

    await expect(context.gateway.pullSince("old-cursor")).resolves.toEqual({
      entries: [],
      cursor: "server-high-water",
    });
  });

  it("propagates snapshot and private download errors", async () => {
    const snapshotContext = createContext();
    const snapshotFailure = new Error("snapshot unavailable");
    snapshotContext.adapter.snapshotError = snapshotFailure;

    await expect(snapshotContext.gateway.pullSince()).rejects.toBe(
      snapshotFailure,
    );

    const downloadContext = createContext();
    const downloadFailure = new Error("private download unavailable");
    downloadContext.adapter.downloadError = downloadFailure;
    downloadContext.adapter.snapshot = {
      entries: [
        {
          id: "entry-active",
          user_id: "anonymous-user",
          entry_date: "2026-07-30",
          text: "Active",
          created_at: "2026-07-30T08:00:00.000Z",
          updated_at: "2026-07-30T10:02:00.000Z",
          deleted_at: null,
        },
      ],
      media: [
        {
          id: "media-remote",
          user_id: "anonymous-user",
          entry_id: "entry-active",
          storage_path: "anonymous-user/2026/07/media-remote.png",
          mime_type: "image/png",
          width: null,
          height: null,
          sort_order: 0,
          created_at: "2026-07-30T08:00:00.000Z",
          updated_at: "2026-07-30T08:00:00.000Z",
          deleted_at: null,
        },
      ],
      preference: null,
      cursor: "server-high-water",
    };

    await expect(downloadContext.gateway.pullSince()).rejects.toBe(
      downloadFailure,
    );
  });

  it("falls back to the downloaded blob when browser thumbnail APIs are unavailable", async () => {
    const downloaded = new Blob(["not-decodable"], { type: "image/png" });

    await expect(
      createBrowserThumbnail(downloaded, "image/png"),
    ).resolves.toBe(downloaded);
  });
});
