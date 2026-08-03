import type { SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  type SupabaseOperationLookup,
  type SupabaseOperationStatus,
  type SupabaseSnapshot,
} from "./supabaseGateway";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "00000000-0000-4000-8000-000000000002";
const ENTRY_ID = "00000000-0000-4000-8000-000000000101";
const ACTIVE_ENTRY_ID = "00000000-0000-4000-8000-000000000102";
const DELETED_ENTRY_ID = "00000000-0000-4000-8000-000000000103";
const MEDIA_ID = "00000000-0000-4000-8000-000000000201";
const REMOTE_MEDIA_ID = "00000000-0000-4000-8000-000000000202";
const SECOND_MEDIA_ID = "00000000-0000-4000-8000-000000000203";
const CREATE_OPERATION_ID = "00000000-0000-4000-8000-000000000301";
const DELETE_OPERATION_ID = "00000000-0000-4000-8000-000000000302";
const PREFERENCE_OPERATION_ID = "00000000-0000-4000-8000-000000000303";
const MEDIA_PATH = `${USER_ID}/2026/07/${MEDIA_ID}.png`;
const REMOTE_MEDIA_PATH = `${USER_ID}/2026/07/${REMOTE_MEDIA_ID}.png`;

const entry: DiaryEntry = {
  id: ENTRY_ID,
  userId: USER_ID,
  entryDate: "2026-07-30",
  text: "Cloud diary",
  createdAt: "2026-07-30T08:00:00.000Z",
  updatedAt: "2026-07-30T08:00:00.000Z",
  media: [],
  syncState: "waiting",
};

const media: MediaAsset = {
  id: MEDIA_ID,
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

  async getMedia(id: string): Promise<MediaAsset | undefined> {
    return this.media.find((asset) => asset.id === id);
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
      if (storagePath === undefined) {
        return asset;
      }
      const cloudBackedAsset = { ...asset, storagePath };
      delete cloudBackedAsset.localBlob;
      return cloudBackedAsset;
    });
  }
}

class FakeSupabaseAdapter implements SupabaseGatewayAdapter {
  sessionUserId?: string;
  anonymousUserId: string | null = USER_ID;
  signInCalls = 0;
  readonly completedOperations = new Set<string>();
  readonly operationBindings = new Map<
    string,
    Omit<SupabaseOperationLookup, "operationId">
  >();
  readonly operationChecks: SupabaseOperationLookup[] = [];
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
  getSessionError?: Error;
  signInError?: Error;

  constructor(private readonly events: string[]) {}

  async getSessionUser(): Promise<string | undefined> {
    this.events.push("get-session");
    if (this.getSessionError !== undefined) {
      throw this.getSessionError;
    }
    return this.sessionUserId;
  }

  async signInAnonymously(): Promise<string | undefined> {
    this.events.push("sign-in");
    this.signInCalls += 1;
    if (this.signInError !== undefined) {
      throw this.signInError;
    }
    this.sessionUserId = this.anonymousUserId ?? undefined;
    return this.sessionUserId;
  }

  async getOperationStatus(
    request: SupabaseOperationLookup,
  ): Promise<SupabaseOperationStatus> {
    this.events.push(`check:${request.operationId}`);
    this.operationChecks.push(request);
    const binding = this.operationBindings.get(request.operationId);
    if (
      binding !== undefined &&
      (
        binding.operationKind !== request.operationKind ||
        binding.entityId !== request.entityId
      )
    ) {
      throw new Error("Operation ID binding collision");
    }
    if (this.completedOperations.has(request.operationId)) {
      return "completed";
    }
    return binding === undefined ? "missing" : "pending";
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
    this.operationBindings.set(request.operationId, {
      operationKind: "create-entry",
      entityId: request.entry.id,
    });
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
    this.operationBindings.set(request.operationId, {
      operationKind: "delete-entry",
      entityId: request.entryId,
    });
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
    this.operationBindings.set(request.operationId, {
      operationKind: "upsert-preference",
      entityId: "background",
    });
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
  it("revalidates sequential checks without signing in a second time", async () => {
    const { adapter, gateway } = createContext();

    await expect(gateway.ensureSession()).resolves.toEqual({
      userId: USER_ID,
    });
    adapter.sessionUserId = USER_ID;
    await expect(gateway.ensureSession()).resolves.toEqual({
      userId: USER_ID,
    });
    expect(adapter.signInCalls).toBe(1);
    expect(
      adapter.operationChecks,
    ).toEqual([]);
  });

  it("deduplicates only concurrent session checks", async () => {
    const { adapter, events, gateway } = createContext();
    adapter.sessionUserId = USER_ID;

    await Promise.all([gateway.ensureSession(), gateway.ensureSession()]);
    await gateway.ensureSession();

    expect(events.filter((event) => event === "get-session")).toHaveLength(2);
  });

  it("pauses instead of signing in again after the established session is lost", async () => {
    const { adapter, gateway } = createContext();
    adapter.sessionUserId = USER_ID;
    await gateway.ensureSession();
    adapter.sessionUserId = undefined;

    await expect(gateway.ensureSession()).rejects.toBeInstanceOf(
      CloudSessionPausedError,
    );
    expect(adapter.signInCalls).toBe(0);
  });

  it("pauses when the session identity changes", async () => {
    const { adapter, gateway } = createContext();
    adapter.sessionUserId = USER_ID;
    await gateway.ensureSession();
    adapter.sessionUserId = OTHER_USER_ID;

    await expect(gateway.ensureSession()).rejects.toBeInstanceOf(
      CloudSessionPausedError,
    );
    expect(adapter.signInCalls).toBe(0);
  });

  it("uses the current session without anonymous sign-in", async () => {
    const { adapter, gateway } = createContext();
    adapter.sessionUserId = USER_ID;

    await expect(gateway.ensureSession()).resolves.toEqual({
      userId: USER_ID,
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

  it("does not replace a malformed current identity with anonymous auth", async () => {
    const { adapter, gateway } = createContext();
    adapter.sessionUserId = "not-a-canonical-uuid";

    await expect(gateway.ensureSession()).rejects.toBeInstanceOf(
      CloudSessionPausedError,
    );
    expect(adapter.signInCalls).toBe(0);
  });

  it("maps a missing getSession rejection to a paused error with its cause", async () => {
    const { adapter, gateway } = createContext();
    const cause = Object.assign(new Error("Auth session missing"), {
      name: "AuthSessionMissingError",
      status: 400,
    });
    adapter.getSessionError = cause;

    await expect(gateway.ensureSession()).rejects.toMatchObject({
      name: "CloudSessionPausedError",
      cause,
    });
    expect(adapter.signInCalls).toBe(0);
  });

  it("maps an expired anonymous sign-in rejection to a paused error with its cause", async () => {
    const { adapter, gateway } = createContext();
    const cause = Object.assign(new Error("JWT expired"), {
      name: "AuthApiError",
      code: "session_expired",
      status: 401,
    });
    adapter.signInError = cause;

    await expect(gateway.ensureSession()).rejects.toMatchObject({
      name: "CloudSessionPausedError",
      cause,
    });
  });

  it("maps an invalid token response to paused even when its status is 500", async () => {
    const { adapter, gateway } = createContext();
    const cause = Object.assign(new Error("Auth session or user missing"), {
      name: "AuthInvalidTokenResponseError",
      status: 500,
    });
    adapter.getSessionError = cause;

    await expect(gateway.ensureSession()).rejects.toMatchObject({
      name: "CloudSessionPausedError",
      cause,
    });
  });

  it.each([
    {
      source: "getSession",
      error: Object.assign(new Error("Service unavailable"), {
        name: "AuthApiError",
        status: 503,
      }),
    },
    {
      source: "signInAnonymously",
      error: Object.assign(new Error("Failed to fetch"), {
        name: "AuthRetryableFetchError",
        status: 0,
      }),
    },
    {
      source: "getSession",
      error: Object.assign(new Error("Network request temporarily unavailable"), {
        name: "AuthApiError",
      }),
    },
  ])("keeps retryable $source rejections generic", async ({ error, source }) => {
    const { adapter, gateway } = createContext();
    if (source === "getSession") {
      adapter.getSessionError = error;
    } else {
      adapter.signInError = error;
    }

    await expect(gateway.ensureSession()).rejects.toBe(error);
    await expect(gateway.ensureSession()).rejects.not.toBeInstanceOf(
      CloudSessionPausedError,
    );
  });
});

describe("SupabaseGateway pushes", () => {
  it("uses the operation ledger to skip sequential replay uploads and DB application", async () => {
    const { adapter, events, gateway, repository } = createContext();

    await gateway.pushCreate(ENTRY_ID, CREATE_OPERATION_ID);
    adapter.sessionUserId = USER_ID;
    await gateway.pushCreate(ENTRY_ID, CREATE_OPERATION_ID);

    expect(adapter.uploads).toHaveLength(1);
    expect(adapter.uploads[0]).toMatchObject({
      bucket: "diary-images",
      path: MEDIA_PATH,
      options: { contentType: "image/png", upsert: true },
    });
    expect(adapter.applyCreates).toEqual([
      {
        operationId: CREATE_OPERATION_ID,
        entry: {
          id: ENTRY_ID,
          entry_date: "2026-07-30",
          text: "Cloud diary",
          created_at: "2026-07-30T08:00:00.000Z",
          updated_at: "2026-07-30T08:00:00.000Z",
          deleted_at: null,
        },
        media: [
          {
            id: MEDIA_ID,
            entry_id: ENTRY_ID,
            storage_path: MEDIA_PATH,
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
          id: MEDIA_ID,
          storagePath: MEDIA_PATH,
        },
      ],
    ]);
    expect(events).toEqual([
      "get-session",
      "sign-in",
      `check:${CREATE_OPERATION_ID}`,
      `upload:${MEDIA_PATH}`,
      `apply-create:${CREATE_OPERATION_ID}`,
      "persist-storage-paths",
      "get-session",
      `check:${CREATE_OPERATION_ID}`,
    ]);
  });

  it("rejects an operation ID bound to another kind or entity before upload", async () => {
    const context = createContext();
    context.adapter.operationBindings.set(CREATE_OPERATION_ID, {
      operationKind: "delete-entry",
      entityId: ENTRY_ID,
    });
    context.adapter.completedOperations.add(CREATE_OPERATION_ID);

    await expect(
      context.gateway.pushCreate(ENTRY_ID, CREATE_OPERATION_ID),
    ).rejects.toThrow("Operation ID binding collision");
    expect(context.adapter.uploads).toEqual([]);
    expect(context.adapter.applyCreates).toEqual([]);
    expect(context.adapter.operationChecks).toEqual([
      {
        operationId: CREATE_OPERATION_ID,
        operationKind: "create-entry",
        entityId: ENTRY_ID,
      },
    ]);
  });

  it("retries only local metadata when the RPC completed before persistence failed", async () => {
    const context = createContext();
    const persistenceFailure = new Error("IndexedDB unavailable");
    context.repository.metadataFailures.push(persistenceFailure);

    await expect(
      context.gateway.pushCreate(ENTRY_ID, CREATE_OPERATION_ID),
    ).rejects.toBe(persistenceFailure);
    await expect(
      context.gateway.pushCreate(ENTRY_ID, CREATE_OPERATION_ID),
    ).resolves.toBeUndefined();

    expect(context.adapter.uploads).toHaveLength(1);
    expect(context.adapter.applyCreates).toHaveLength(1);
    expect(context.repository.metadataUpdates).toHaveLength(2);
  });

  it("clears an uploaded original even when its storage path was already current", async () => {
    const context = createContext();
    context.repository.media = [
      {
        ...media,
        storagePath: MEDIA_PATH,
        thumbnailBlob: new Blob(["thumbnail"], { type: "image/webp" }),
      },
    ];

    await context.gateway.pushCreate(ENTRY_ID, CREATE_OPERATION_ID);

    expect(context.repository.metadataUpdates).toEqual([
      [{ id: MEDIA_ID, storagePath: MEDIA_PATH }],
    ]);
    expect(context.repository.media[0]?.localBlob).toBeUndefined();
    expect(
      await context.repository.media[0]?.thumbnailBlob?.text(),
    ).toBe("thumbnail");
  });

  it("does not apply metadata or persist paths after a failed upload", async () => {
    const context = createContext();
    const failure = new Error("upload unavailable");
    context.adapter.uploadError = failure;

    await expect(
      context.gateway.pushCreate(ENTRY_ID, CREATE_OPERATION_ID),
    ).rejects.toBe(failure);
    expect(context.adapter.applyCreates).toEqual([]);
    expect(context.repository.metadataUpdates).toEqual([]);
  });

  it("validates the complete create payload before the first upload", async () => {
    const invalidCases: Array<{
      label: string;
      entry?: Partial<DiaryEntry>;
      media?: Partial<MediaAsset>;
    }> = [
      { label: "entry UUID", entry: { id: "not-a-uuid" } },
      { label: "entry date", entry: { entryDate: "2026-02-30" } },
      { label: "entry date year", entry: { entryDate: "0000-01-01" } },
      { label: "created timestamp", entry: { createdAt: "not-a-time" } },
      { label: "updated timestamp", entry: { updatedAt: "not-a-time" } },
      { label: "deleted timestamp", entry: { deletedAt: "not-a-time" } },
      { label: "media UUID", media: { id: "not-a-uuid" } },
      { label: "media timestamp", media: { createdAt: "not-a-time" } },
      { label: "width", media: { width: 0 } },
      { label: "height", media: { height: 1.5 } },
      {
        label: "dimension pair",
        media: { width: undefined, height: 900 },
      },
      { label: "sort order", media: { sortOrder: -1 } },
      { label: "MIME type", media: { mimeType: "text/plain" } },
      {
        label: "owned path",
        media: {
          storagePath: `${OTHER_USER_ID}/2026/07/${SECOND_MEDIA_ID}.png`,
        },
      },
    ];

    for (const invalidCase of invalidCases) {
      const context = createContext();
      context.repository.entry = { ...entry, ...invalidCase.entry };
      context.repository.media = [
        { ...media },
        {
          ...media,
          ...invalidCase.media,
          id: invalidCase.media?.id ?? SECOND_MEDIA_ID,
          sortOrder: invalidCase.media?.sortOrder ?? 1,
        },
      ];

      await expect(
        context.gateway.pushCreate(
          context.repository.entry.id,
          CREATE_OPERATION_ID,
        ),
        invalidCase.label,
      ).rejects.toBeInstanceOf(TypeError);
      expect(context.adapter.uploads, invalidCase.label).toEqual([]);
      expect(context.adapter.applyCreates, invalidCase.label).toEqual([]);
    }
  });

  it("rejects a create with a missing original before uploading earlier media", async () => {
    const context = createContext();
    context.repository.media = [
      { ...media },
      {
        ...media,
        id: SECOND_MEDIA_ID,
        sortOrder: 1,
        localBlob: undefined,
      },
    ];

    await expect(
      context.gateway.pushCreate(ENTRY_ID, CREATE_OPERATION_ID),
    ).rejects.toThrow(`Media asset has no uploadable blob: ${SECOND_MEDIA_ID}`);
    expect(context.adapter.uploads).toEqual([]);
  });

  it("applies the exact tombstone before removing only owned paths", async () => {
    const context = createContext();
    context.repository.media = [
      {
        ...media,
        storagePath: MEDIA_PATH,
      },
    ];
    context.adapter.deleteStoragePaths = [
      `${USER_ID}/2026/07/${SECOND_MEDIA_ID}.png`,
      `${USER_ID}/2026/07/not-a-uuid.png`,
      `${OTHER_USER_ID}/2026/07/${REMOTE_MEDIA_ID}.png`,
    ];
    const deletedAt = "2026-07-29T12:00:00.000Z";

    await context.gateway.pushDelete(
      ENTRY_ID,
      deletedAt,
      DELETE_OPERATION_ID,
    );

    expect(context.adapter.applyDeletes).toEqual([
      {
        operationId: DELETE_OPERATION_ID,
        entryId: ENTRY_ID,
        deletedAt,
      },
    ]);
    expect(context.adapter.removals).toEqual([
      {
        bucket: "diary-images",
        paths: [
          MEDIA_PATH,
          `${USER_ID}/2026/07/${SECOND_MEDIA_ID}.png`,
        ],
      },
    ]);
    expect(context.events.indexOf(`apply-delete:${DELETE_OPERATION_ID}`)).toBeLessThan(
      context.events.findIndex((event) => event.startsWith("remove:")),
    );
  });

  it("applies a complete preference snapshot with its exact timestamp", async () => {
    const context = createContext();
    const preference: StoredPreference = {
      key: "background",
      value: {
        home: { mode: "solid" },
        calendar: { mode: "pinned", pinnedAssetId: MEDIA_ID },
      },
      updatedAt: "2026-07-30T10:11:12.000Z",
    };

    await context.gateway.pushPreference(
      preference,
      PREFERENCE_OPERATION_ID,
    );

    expect(context.adapter.applyPreferences).toEqual([
      {
        operationId: PREFERENCE_OPERATION_ID,
        home: { mode: "solid" },
        calendar: { mode: "pinned", pinnedAssetId: MEDIA_ID },
        updatedAt: "2026-07-30T10:11:12.000Z",
      },
    ]);
  });

  it("validates delete and pinned preference UUIDs before applying RPCs", async () => {
    const deleteContext = createContext();
    await expect(
      deleteContext.gateway.pushDelete(
        "not-a-uuid",
        "2026-07-30T10:11:12.000Z",
        DELETE_OPERATION_ID,
      ),
    ).rejects.toBeInstanceOf(TypeError);
    expect(deleteContext.adapter.applyDeletes).toEqual([]);

    const preferenceContext = createContext();
    await expect(
      preferenceContext.gateway.pushPreference(
        {
          key: "background",
          value: {
            home: { mode: "pinned", pinnedAssetId: "not-a-uuid" },
            calendar: { mode: "solid" },
          },
          updatedAt: "2026-07-30T10:11:12.000Z",
        },
        PREFERENCE_OPERATION_ID,
      ),
    ).rejects.toBeInstanceOf(TypeError);
    expect(preferenceContext.adapter.applyPreferences).toEqual([]);
  });
});

describe("SupabaseGateway snapshot pulls", () => {
  it("maps metadata, tombstones, generated thumbnails, and the server cursor", async () => {
    const context = createContext();
    const localBlob = new Blob(["private"], { type: "image/png" });
    context.adapter.snapshot = {
      entries: [
        {
          id: DELETED_ENTRY_ID,
          user_id: USER_ID,
          entry_date: "2026-07-29",
          text: "Deleted",
          created_at: "2026-07-29T08:00:00.000Z",
          updated_at: "2026-07-30T10:03:00.000Z",
          deleted_at: "2026-07-30T10:03:00.000Z",
        },
        {
          id: ACTIVE_ENTRY_ID,
          user_id: USER_ID,
          entry_date: "2026-07-30",
          text: "Active",
          created_at: "2026-07-30T08:00:00.000Z",
          updated_at: "2026-07-30T10:02:00.000Z",
          deleted_at: null,
        },
      ],
      media: [
        {
          id: REMOTE_MEDIA_ID,
          user_id: USER_ID,
          entry_id: ACTIVE_ENTRY_ID,
          storage_path: REMOTE_MEDIA_PATH,
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
        user_id: USER_ID,
        home_background_mode: "random",
        home_pinned_background_asset_id: null,
        background_mode: "pinned",
        pinned_background_asset_id: REMOTE_MEDIA_ID,
        updated_at: "2026-07-30T10:04:00.000Z",
      },
      cursor: "2026-08-01T00:00:00.000Z",
    };
    context.adapter.blobs.set(
      REMOTE_MEDIA_PATH,
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
        path: REMOTE_MEDIA_PATH,
      },
    ]);
    expect(context.createThumbnail).toHaveBeenCalledWith(
      localBlob,
      "image/png",
    );
    expect(result.cursor).toBe("2026-08-01T00:00:00.000Z");
    expect(result.preferences).toEqual({
      key: "background",
      value: {
        home: { mode: "random" },
        calendar: { mode: "pinned", pinnedAssetId: REMOTE_MEDIA_ID },
      },
      updatedAt: "2026-07-30T10:04:00.000Z",
    });
    expect(result.entries).toMatchObject([
      {
        id: ACTIVE_ENTRY_ID,
        media: [
          {
            id: REMOTE_MEDIA_ID,
            thumbnailBlob: expect.any(Blob),
          },
        ],
      },
      {
        id: DELETED_ENTRY_ID,
        deletedAt: "2026-07-30T10:03:00.000Z",
        media: [],
      },
    ]);
    expect(
      await result.entries[0]?.media[0]?.thumbnailBlob?.text(),
    ).toBe("private-thumbnail");
    expect(result.entries[0]?.media[0]?.localBlob).toBeUndefined();
  });

  it("reuses a local thumbnail without downloading the original", async () => {
    const context = createContext();
    const thumbnailBlob = new Blob(["cached-thumbnail"], {
      type: "image/webp",
    });
    context.repository.media = [
      {
        ...media,
        id: REMOTE_MEDIA_ID,
        entryId: ACTIVE_ENTRY_ID,
        storagePath: REMOTE_MEDIA_PATH,
        thumbnailBlob,
        localBlob: undefined,
      },
    ];
    context.adapter.snapshot = {
      entries: [
        {
          id: ACTIVE_ENTRY_ID,
          user_id: USER_ID,
          entry_date: "2026-07-30",
          text: "Active",
          created_at: "2026-07-30T08:00:00.000Z",
          updated_at: "2026-07-30T10:02:00.000Z",
          deleted_at: null,
        },
      ],
      media: [
        {
          id: REMOTE_MEDIA_ID,
          user_id: USER_ID,
          entry_id: ACTIVE_ENTRY_ID,
          storage_path: REMOTE_MEDIA_PATH,
          mime_type: "image/png",
          width: 640,
          height: 480,
          sort_order: 0,
          created_at: "2026-07-30T08:00:00.000Z",
          updated_at: "2026-07-30T08:00:00.000Z",
          deleted_at: null,
        },
      ],
      preference: null,
      cursor: "server-high-water",
    };

    const result = await context.gateway.pullSince();

    expect(context.adapter.downloads).toEqual([]);
    expect(context.createThumbnail).not.toHaveBeenCalled();
    expect(result.entries[0]?.media[0]?.thumbnailBlob).toBe(thumbnailBlob);
    expect(result.entries[0]?.media[0]?.localBlob).toBeUndefined();
  });

  it("returns the stable server cursor from an empty snapshot", async () => {
    const context = createContext();
    context.adapter.snapshot.cursor = "server-high-water";

    await expect(context.gateway.pullSince("old-cursor")).resolves.toEqual({
      entries: [],
      cursor: "server-high-water",
    });
  });

  it("propagates snapshot errors", async () => {
    const snapshotContext = createContext();
    const snapshotFailure = new Error("snapshot unavailable");
    snapshotContext.adapter.snapshotError = snapshotFailure;

    await expect(snapshotContext.gateway.pullSince()).rejects.toBe(
      snapshotFailure,
    );
  });

  it("isolates a broken media object from metadata and tombstones", async () => {
    const downloadContext = createContext();
    const downloadFailure = new Error("private download unavailable");
    downloadContext.adapter.downloadError = downloadFailure;
    downloadContext.adapter.snapshot = {
      entries: [
        {
          id: ACTIVE_ENTRY_ID,
          user_id: USER_ID,
          entry_date: "2026-07-30",
          text: "Active",
          created_at: "2026-07-30T08:00:00.000Z",
          updated_at: "2026-07-30T10:02:00.000Z",
          deleted_at: null,
        },
        {
          id: DELETED_ENTRY_ID,
          user_id: USER_ID,
          entry_date: "2026-07-29",
          text: "Deleted",
          created_at: "2026-07-29T08:00:00.000Z",
          updated_at: "2026-07-30T10:03:00.000Z",
          deleted_at: "2026-07-30T10:03:00.000Z",
        },
      ],
      media: [
        {
          id: REMOTE_MEDIA_ID,
          user_id: USER_ID,
          entry_id: ACTIVE_ENTRY_ID,
          storage_path: REMOTE_MEDIA_PATH,
          mime_type: "image/png",
          width: null,
          height: null,
          sort_order: 0,
          created_at: "2026-07-30T08:00:00.000Z",
          updated_at: "2026-07-30T08:00:00.000Z",
          deleted_at: null,
        },
      ],
      preference: {
        user_id: USER_ID,
        background_mode: "random",
        pinned_background_asset_id: null,
        updated_at: "2026-07-30T10:04:00.000Z",
      },
      cursor: "server-high-water",
    };

    const result = await downloadContext.gateway.pullSince();
    expect(result).toMatchObject({
      entries: [
        {
          id: ACTIVE_ENTRY_ID,
          media: [
            {
              id: REMOTE_MEDIA_ID,
              storagePath: REMOTE_MEDIA_PATH,
            },
          ],
        },
        {
          id: DELETED_ENTRY_ID,
          deletedAt: "2026-07-30T10:03:00.000Z",
          media: [],
        },
      ],
      preferences: {
        value: {
          home: { mode: "random" },
          calendar: { mode: "random" },
        },
      },
      cursor: "server-high-water",
    });
    const broken = result.entries[0]?.media[0];
    expect(broken?.thumbnailBlob).toBeUndefined();
    expect(broken?.localBlob).toBeUndefined();
  });

  it("returns no thumbnail when browser thumbnail APIs are unavailable", async () => {
    const downloaded = new Blob(["not-decodable"], { type: "image/png" });

    await expect(
      createBrowserThumbnail(downloaded, "image/png"),
    ).resolves.toBeUndefined();
  });

  it("returns no thumbnail when image decoding rejects", async () => {
    const downloaded = new Blob(["broken-image"], { type: "image/png" });
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("decode failed")),
    );

    try {
      await expect(
        createBrowserThumbnail(downloaded, "image/png"),
      ).resolves.toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns no thumbnail when canvas rendering is unavailable", async () => {
    const downloaded = new Blob(["decoded-image"], { type: "image/png" });
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({
        width: 1200,
        height: 900,
        close,
      }),
    );
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return null;
        }
      },
    );
    vi.stubGlobal("document", undefined);

    try {
      await expect(
        createBrowserThumbnail(downloaded, "image/png"),
      ).resolves.toBeUndefined();
      expect(close).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Supabase migration conflict contract", () => {
  const migration = readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/202607300001_visual_diary.sql",
    ),
    "utf8",
  );

  it("binds typed operation status to kind and entity", () => {
    expect(migration).toContain(
      "create type public.visual_diary_operation_status as enum",
    );
    expect(migration).toContain("entity_id text not null");
    expect(migration).toContain(
      "create or replace function public.visual_diary_get_operation_status",
    );
    expect(migration).toContain(
      "v_existing_entity_id <> p_entity_id",
    );
  });

  it("keeps tombstones and newer entry or media versions over stale creates", () => {
    expect(migration).toMatch(
      /deleted_at is null\s+and v_entry_deleted_at is null\s+and v_entry_updated_at > updated_at/,
    );
    expect(migration).toMatch(
      /deleted_at is null\s+and v_media_deleted_at is null\s+and v_media_updated_at > updated_at/,
    );
  });

  it("applies delete ties, resets pinned media, and completes stale no-ops", () => {
    expect(migration).toMatch(
      /p_deleted_at >= greatest\(\s*updated_at,\s*coalesce\(deleted_at, '-infinity'::timestamptz\)\s*\)/,
    );
    expect(migration).toMatch(
      /set background_mode = 'solid',\s+pinned_background_asset_id = null/,
    );
    expect(migration).toMatch(
      /set home_background_mode = 'solid',\s+home_pinned_background_asset_id = null/,
    );
    expect(migration).toMatch(
      /update public\.sync_operations\s+set completed_at = clock_timestamp\(\)/,
    );
  });

  it("uses deterministic preference ties and validates exact owned paths", () => {
    expect(migration).toContain("home_background_mode text not null");
    expect(migration).toContain("p_home_background_mode text");
    expect(migration).toContain(
      "v_incoming_preference_key > v_existing_preference_key",
    );
    expect(migration).toContain(
      "v_media_storage_path <> v_expected_storage_path",
    );
    expect(migration).toContain("DETERMINISTIC RETRY AND ORPHAN MAINTENANCE");
  });
});
