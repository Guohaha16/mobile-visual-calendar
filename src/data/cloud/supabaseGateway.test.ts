import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type {
  DiaryEntry,
  MediaAsset,
  StoredPreference,
} from "../../domain/types";
import { CloudSessionPausedError } from "./cloudGateway";
import { createSupabaseClient } from "./supabaseClient";
import {
  SupabaseGateway,
  type SupabaseGatewayAdapter,
  type SupabaseSelectRequest,
  type SupabaseUpdateRequest,
  type SupabaseUpsertRequest,
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

const createRepository = (
  entryResult: DiaryEntry | undefined = entry,
  mediaResult: MediaAsset[] = [media],
) => ({
  getEntry: vi.fn(async () => entryResult),
  listMediaForEntry: vi.fn(async () => mediaResult),
});

class FakeSupabaseAdapter implements SupabaseGatewayAdapter {
  sessionUserId?: string;
  anonymousUserId: string | null = "anonymous-user";
  signInCalls = 0;
  readonly events: string[] = [];
  readonly uploads: Array<{
    bucket: string;
    path: string;
    body: Blob;
    options: { contentType: string; upsert: boolean };
  }> = [];
  readonly upserts: SupabaseUpsertRequest[] = [];
  readonly updates: SupabaseUpdateRequest[] = [];
  readonly selects: SupabaseSelectRequest[] = [];
  readonly removals: Array<{ bucket: string; paths: string[] }> = [];
  readonly downloads: Array<{ bucket: string; path: string }> = [];
  readonly rows = new Map<string, Array<Record<string, unknown>>>();
  readonly blobs = new Map<string, Blob>();
  uploadError?: Error;
  updateError?: Error;
  selectError?: Error;
  downloadError?: Error;

  async getSessionUser(): Promise<string | undefined> {
    this.events.push("get-session");
    return this.sessionUserId;
  }

  async signInAnonymously(): Promise<string | undefined> {
    this.events.push("sign-in");
    this.signInCalls += 1;
    return this.anonymousUserId ?? undefined;
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

  async upsert(request: SupabaseUpsertRequest): Promise<void> {
    this.events.push(`upsert:${request.table}`);
    this.upserts.push(request);
  }

  async update(request: SupabaseUpdateRequest): Promise<void> {
    this.events.push(`update:${request.table}`);
    if (this.updateError !== undefined) {
      throw this.updateError;
    }
    this.updates.push(request);
  }

  async select<T>(
    request: SupabaseSelectRequest,
  ): Promise<T[]> {
    this.events.push(`select:${request.table}`);
    if (this.selectError !== undefined) {
      throw this.selectError;
    }
    this.selects.push(request);
    return (this.rows.get(request.table) ?? []) as unknown as T[];
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
    const adapter = new FakeSupabaseAdapter();
    const gateway = new SupabaseGateway({
      adapter,
      repository: createRepository(),
    });

    await expect(gateway.ensureSession()).resolves.toEqual({
      userId: "anonymous-user",
    });
    await expect(gateway.ensureSession()).resolves.toEqual({
      userId: "anonymous-user",
    });

    expect(adapter.signInCalls).toBe(1);
  });

  it("uses the current session without anonymous sign-in", async () => {
    const adapter = new FakeSupabaseAdapter();
    adapter.sessionUserId = "existing-user";
    const gateway = new SupabaseGateway({
      adapter,
      repository: createRepository(),
    });

    await expect(gateway.ensureSession()).resolves.toEqual({
      userId: "existing-user",
    });
    expect(adapter.signInCalls).toBe(0);
  });

  it("pauses when Supabase is absent or anonymous auth returns no valid user", async () => {
    const invalid = new FakeSupabaseAdapter();
    invalid.anonymousUserId = null;

    await expect(
      new SupabaseGateway({
        adapter: undefined,
        repository: createRepository(),
      }).ensureSession(),
    ).rejects.toBeInstanceOf(CloudSessionPausedError);
    await expect(
      new SupabaseGateway({
        adapter: invalid,
        repository: createRepository(),
      }).ensureSession(),
    ).rejects.toBeInstanceOf(CloudSessionPausedError);
  });
});

describe("SupabaseGateway pushes", () => {
  it("uploads a deterministic private path before idempotent metadata upserts", async () => {
    const adapter = new FakeSupabaseAdapter();
    const gateway = new SupabaseGateway({
      adapter,
      repository: createRepository(),
    });

    await gateway.pushCreate("entry-1", "operation-1");
    await gateway.pushCreate("entry-1", "operation-1");

    expect(adapter.uploads.map((upload) => upload.path)).toEqual([
      "anonymous-user/2026/07/media-1.png",
      "anonymous-user/2026/07/media-1.png",
    ]);
    expect(adapter.uploads[0]).toMatchObject({
      bucket: "diary-images",
      options: { contentType: "image/png", upsert: true },
    });
    expect(adapter.events.slice(2, 5)).toEqual([
      "upload:anonymous-user/2026/07/media-1.png",
      "upsert:diary_entries",
      "upsert:media_assets",
    ]);
    expect(adapter.upserts.filter(({ table }) => table === "diary_entries")).toEqual([
      {
        table: "diary_entries",
        onConflict: "user_id,id",
        rows: [
          {
            id: "entry-1",
            user_id: "anonymous-user",
            entry_date: "2026-07-30",
            text: "Cloud diary",
            created_at: "2026-07-30T08:00:00.000Z",
            updated_at: "2026-07-30T08:00:00.000Z",
            deleted_at: null,
            last_operation_id: "operation-1",
          },
        ],
      },
      {
        table: "diary_entries",
        onConflict: "user_id,id",
        rows: [
          {
            id: "entry-1",
            user_id: "anonymous-user",
            entry_date: "2026-07-30",
            text: "Cloud diary",
            created_at: "2026-07-30T08:00:00.000Z",
            updated_at: "2026-07-30T08:00:00.000Z",
            deleted_at: null,
            last_operation_id: "operation-1",
          },
        ],
      },
    ]);
    expect(adapter.upserts.filter(({ table }) => table === "media_assets")).toEqual([
      {
        table: "media_assets",
        onConflict: "user_id,id",
        rows: [
          {
            id: "media-1",
            user_id: "anonymous-user",
            entry_id: "entry-1",
            storage_path: "anonymous-user/2026/07/media-1.png",
            mime_type: "image/png",
            width: 1200,
            height: 900,
            sort_order: 0,
            created_at: "2026-07-30T08:00:00.000Z",
            updated_at: "2026-07-30T08:00:00.000Z",
            deleted_at: null,
            last_operation_id: "operation-1",
          },
        ],
      },
      {
        table: "media_assets",
        onConflict: "user_id,id",
        rows: [
          {
            id: "media-1",
            user_id: "anonymous-user",
            entry_id: "entry-1",
            storage_path: "anonymous-user/2026/07/media-1.png",
            mime_type: "image/png",
            width: 1200,
            height: 900,
            sort_order: 0,
            created_at: "2026-07-30T08:00:00.000Z",
            updated_at: "2026-07-30T08:00:00.000Z",
            deleted_at: null,
            last_operation_id: "operation-1",
          },
        ],
      },
    ]);
  });

  it("writes the exact tombstone before removing only owned paths", async () => {
    const adapter = new FakeSupabaseAdapter();
    adapter.rows.set("media_assets", [
      { storage_path: "anonymous-user/2026/07/remote.png" },
      { storage_path: "other-user/2026/07/not-owned.png" },
    ]);
    const localMedia = [
      { ...media, storagePath: "anonymous-user/2026/07/local.png" },
      { ...media, id: "media-2", storagePath: "other-user/unsafe.png" },
    ];
    const gateway = new SupabaseGateway({
      adapter,
      repository: createRepository(entry, localMedia),
    });
    const deletedAt = "2026-07-29T12:00:00.000Z";

    await gateway.pushDelete("entry-1", deletedAt, "operation-delete");

    expect(adapter.updates).toEqual([
      {
        table: "diary_entries",
        values: {
          deleted_at: deletedAt,
          updated_at: deletedAt,
          last_operation_id: "operation-delete",
        },
        filters: [
          { operator: "eq", column: "id", value: "entry-1" },
          {
            operator: "eq",
            column: "user_id",
            value: "anonymous-user",
          },
        ],
      },
    ]);
    expect(adapter.removals).toEqual([
      {
        bucket: "diary-images",
        paths: [
          "anonymous-user/2026/07/local.png",
          "anonymous-user/2026/07/remote.png",
        ],
      },
    ]);
    expect(adapter.events.indexOf("update:diary_entries")).toBeLessThan(
      adapter.events.findIndex((event) => event.startsWith("remove:")),
    );
  });

  it("upserts a complete preference snapshot with its exact timestamp", async () => {
    const adapter = new FakeSupabaseAdapter();
    const gateway = new SupabaseGateway({
      adapter,
      repository: createRepository(),
    });
    const preference: StoredPreference = {
      key: "background",
      value: { mode: "pinned", pinnedAssetId: "media-1" },
      updatedAt: "2026-07-30T10:11:12.000Z",
    };

    await gateway.pushPreference(preference, "operation-preference");

    expect(adapter.upserts).toEqual([
      {
        table: "user_preferences",
        onConflict: "user_id,key",
        rows: [
          {
            user_id: "anonymous-user",
            key: "background",
            background_mode: "pinned",
            pinned_background_asset_id: "media-1",
            updated_at: "2026-07-30T10:11:12.000Z",
            deleted_at: null,
            last_operation_id: "operation-preference",
          },
        ],
      },
    ]);
  });

  it("propagates failed uploads before writing metadata and failed tombstones before removal", async () => {
    const uploadFailure = new Error("upload unavailable");
    const uploadAdapter = new FakeSupabaseAdapter();
    uploadAdapter.uploadError = uploadFailure;
    const uploadGateway = new SupabaseGateway({
      adapter: uploadAdapter,
      repository: createRepository(),
    });

    await expect(
      uploadGateway.pushCreate("entry-1", "operation-1"),
    ).rejects.toBe(uploadFailure);
    expect(uploadAdapter.upserts).toEqual([]);

    const updateFailure = new Error("database unavailable");
    const updateAdapter = new FakeSupabaseAdapter();
    updateAdapter.updateError = updateFailure;
    const updateGateway = new SupabaseGateway({
      adapter: updateAdapter,
      repository: createRepository(),
    });

    await expect(
      updateGateway.pushDelete(
        "entry-1",
        "2026-07-30T12:00:00.000Z",
        "operation-delete",
      ),
    ).rejects.toBe(updateFailure);
    expect(updateAdapter.removals).toEqual([]);
  });
});

describe("SupabaseGateway pulls", () => {
  it("filters every query to the user, includes tombstones, and privately downloads active media", async () => {
    const adapter = new FakeSupabaseAdapter();
    const privateBlob = new Blob(["private"], { type: "image/png" });
    adapter.rows.set("diary_entries", [
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
    ]);
    adapter.rows.set("media_assets", [
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
        updated_at: "2026-07-30T10:02:00.000Z",
        deleted_at: null,
      },
    ]);
    adapter.rows.set("user_preferences", [
      {
        user_id: "anonymous-user",
        key: "background",
        background_mode: "pinned",
        pinned_background_asset_id: "media-remote",
        created_at: "2026-07-30T08:00:00.000Z",
        updated_at: "2026-07-30T10:04:00.000Z",
        deleted_at: null,
      },
    ]);
    adapter.blobs.set(
      "anonymous-user/2026/07/media-remote.png",
      privateBlob,
    );
    const gateway = new SupabaseGateway({
      adapter,
      repository: createRepository(),
    });

    const result = await gateway.pullSince("2026-07-30T10:00:00.000Z");

    expect(
      adapter.selects.every((request) =>
        request.filters.some(
          (filter) =>
            filter.operator === "eq" &&
            filter.column === "user_id" &&
            filter.value === "anonymous-user",
        ),
      ),
    ).toBe(true);
    expect(adapter.selects[0]).toMatchObject({
      table: "diary_entries",
      filters: [
        {
          operator: "eq",
          column: "user_id",
          value: "anonymous-user",
        },
        {
          operator: "gt",
          column: "updated_at",
          value: "2026-07-30T10:00:00.000Z",
        },
      ],
      order: [
        { column: "updated_at", ascending: true },
        { column: "id", ascending: true },
      ],
    });
    expect(adapter.downloads).toEqual([
      {
        bucket: "diary-images",
        path: "anonymous-user/2026/07/media-remote.png",
      },
    ]);
    expect(result).toEqual({
      entries: [
        {
          id: "entry-active",
          userId: "anonymous-user",
          entryDate: "2026-07-30",
          text: "Active",
          createdAt: "2026-07-30T08:00:00.000Z",
          updatedAt: "2026-07-30T10:02:00.000Z",
          media: [
            {
              id: "media-remote",
              entryId: "entry-active",
              userId: "anonymous-user",
              storagePath: "anonymous-user/2026/07/media-remote.png",
              mimeType: "image/png",
              width: 640,
              height: 480,
              sortOrder: 0,
              createdAt: "2026-07-30T08:00:00.000Z",
              localBlob: privateBlob,
            },
          ],
          syncState: "synced",
        },
        {
          id: "entry-deleted",
          userId: "anonymous-user",
          entryDate: "2026-07-29",
          text: "Deleted",
          createdAt: "2026-07-29T08:00:00.000Z",
          updatedAt: "2026-07-30T10:03:00.000Z",
          deletedAt: "2026-07-30T10:03:00.000Z",
          media: [],
          syncState: "synced",
        },
      ],
      preferences: {
        key: "background",
        value: { mode: "pinned", pinnedAssetId: "media-remote" },
        updatedAt: "2026-07-30T10:04:00.000Z",
      },
      cursor: "2026-07-30T10:04:00.000Z",
    });
  });

  it("preserves an existing cursor when no rows changed", async () => {
    const gateway = new SupabaseGateway({
      adapter: new FakeSupabaseAdapter(),
      repository: createRepository(),
    });

    await expect(
      gateway.pullSince("2026-07-30T10:00:00.000Z"),
    ).resolves.toEqual({
      entries: [],
      cursor: "2026-07-30T10:00:00.000Z",
    });
  });

  it("propagates private download errors", async () => {
    const failure = new Error("private download unavailable");
    const adapter = new FakeSupabaseAdapter();
    adapter.downloadError = failure;
    adapter.rows.set("diary_entries", [
      {
        id: "entry-active",
        user_id: "anonymous-user",
        entry_date: "2026-07-30",
        text: "Active",
        created_at: "2026-07-30T08:00:00.000Z",
        updated_at: "2026-07-30T10:02:00.000Z",
        deleted_at: null,
      },
    ]);
    adapter.rows.set("media_assets", [
      {
        id: "media-remote",
        user_id: "anonymous-user",
        entry_id: "entry-active",
        storage_path: "anonymous-user/2026/07/media-remote.png",
        mime_type: "image/png",
        sort_order: 0,
        created_at: "2026-07-30T08:00:00.000Z",
        updated_at: "2026-07-30T10:02:00.000Z",
        deleted_at: null,
      },
    ]);
    const gateway = new SupabaseGateway({
      adapter,
      repository: createRepository(),
    });

    await expect(gateway.pullSince()).rejects.toBe(failure);
  });
});
