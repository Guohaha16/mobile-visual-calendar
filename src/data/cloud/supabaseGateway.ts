import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  DiaryEntry,
  MediaAsset,
  StoredPreference,
} from "../../domain/types";
import type { DiaryRepository } from "../local/diaryRepository";
import {
  CloudSessionPausedError,
  type CloudGateway,
  type CloudPullResult,
} from "./cloudGateway";

const STORAGE_BUCKET = "diary-images";
const INITIAL_CURSOR = "1970-01-01T00:00:00.000Z";

export type SupabaseFilter =
  | {
      operator: "eq" | "gt" | "is";
      column: string;
      value: unknown;
    }
  | {
      operator: "in";
      column: string;
      value: readonly unknown[];
    };

export interface SupabaseOrder {
  column: string;
  ascending: boolean;
}

export interface SupabaseSelectRequest {
  table: string;
  columns: string;
  filters: SupabaseFilter[];
  order?: SupabaseOrder[];
}

export interface SupabaseUpsertRequest {
  table: string;
  rows: Array<Record<string, unknown>>;
  onConflict: string;
}

export interface SupabaseUpdateRequest {
  table: string;
  values: Record<string, unknown>;
  filters: SupabaseFilter[];
}

export interface SupabaseGatewayAdapter {
  getSessionUser(): Promise<string | undefined>;
  signInAnonymously(): Promise<string | undefined>;
  upload(
    bucket: string,
    path: string,
    body: Blob,
    options: { contentType: string; upsert: boolean },
  ): Promise<void>;
  upsert(request: SupabaseUpsertRequest): Promise<void>;
  update(request: SupabaseUpdateRequest): Promise<void>;
  select<T>(request: SupabaseSelectRequest): Promise<T[]>;
  remove(bucket: string, paths: string[]): Promise<void>;
  download(bucket: string, path: string): Promise<Blob>;
}

export type SupabaseGatewayRepository = Pick<
  DiaryRepository,
  "getEntry" | "listMediaForEntry"
>;

export interface SupabaseGatewayDependencies {
  adapter: SupabaseGatewayAdapter | undefined;
  repository: SupabaseGatewayRepository;
}

interface RawSupabaseResult {
  data: unknown;
  error: unknown;
}

interface RawSupabaseQuery extends PromiseLike<RawSupabaseResult> {
  select(columns: string): RawSupabaseQuery;
  upsert(
    rows: Array<Record<string, unknown>>,
    options: { onConflict: string },
  ): RawSupabaseQuery;
  update(values: Record<string, unknown>): RawSupabaseQuery;
  eq(column: string, value: unknown): RawSupabaseQuery;
  gt(column: string, value: unknown): RawSupabaseQuery;
  in(column: string, values: readonly unknown[]): RawSupabaseQuery;
  is(column: string, value: unknown): RawSupabaseQuery;
  order(
    column: string,
    options: { ascending: boolean },
  ): RawSupabaseQuery;
}

interface DiaryEntryRow {
  id: string;
  user_id: string;
  entry_date: string;
  text: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface MediaAssetRow {
  id: string;
  user_id: string;
  entry_id: string;
  storage_path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface PreferenceRow {
  user_id: string;
  key: string;
  background_mode: string;
  pinned_background_asset_id: string | null;
  updated_at: string;
  deleted_at?: string | null;
}

interface MediaPathRow {
  storage_path: string;
}

const rawQuery = (
  client: SupabaseClient,
  table: string,
): RawSupabaseQuery =>
  client.from(table) as unknown as RawSupabaseQuery;

const throwOnError = (result: RawSupabaseResult): void => {
  if (result.error !== null && result.error !== undefined) {
    throw result.error;
  }
};

const applyFilters = (
  query: RawSupabaseQuery,
  filters: readonly SupabaseFilter[],
): RawSupabaseQuery => {
  let filtered = query;

  for (const filter of filters) {
    switch (filter.operator) {
      case "eq":
        filtered = filtered.eq(filter.column, filter.value);
        break;
      case "gt":
        filtered = filtered.gt(filter.column, filter.value);
        break;
      case "in":
        filtered = filtered.in(filter.column, filter.value);
        break;
      case "is":
        filtered = filtered.is(filter.column, filter.value);
        break;
    }
  }

  return filtered;
};

export const createSupabaseGatewayAdapter = (
  client: SupabaseClient,
): SupabaseGatewayAdapter => ({
  async getSessionUser() {
    const { data, error } = await client.auth.getSession();
    if (error !== null) {
      throw error;
    }
    return data.session?.user.id;
  },

  async signInAnonymously() {
    const { data, error } = await client.auth.signInAnonymously();
    if (error !== null) {
      throw error;
    }
    return data.user?.id;
  },

  async upload(bucket, path, body, options) {
    const { error } = await client.storage
      .from(bucket)
      .upload(path, body, options);
    if (error !== null) {
      throw error;
    }
  },

  async upsert(request) {
    const result = await rawQuery(client, request.table).upsert(
      request.rows,
      { onConflict: request.onConflict },
    );
    throwOnError(result);
  },

  async update(request) {
    const query = rawQuery(client, request.table).update(request.values);
    const result = await applyFilters(query, request.filters);
    throwOnError(result);
  },

  async select<T>(request: SupabaseSelectRequest): Promise<T[]> {
    let query = applyFilters(
      rawQuery(client, request.table).select(request.columns),
      request.filters,
    );
    for (const order of request.order ?? []) {
      query = query.order(order.column, { ascending: order.ascending });
    }
    const result = await query;
    throwOnError(result);
    return (result.data ?? []) as T[];
  },

  async remove(bucket, paths) {
    const { error } = await client.storage.from(bucket).remove(paths);
    if (error !== null) {
      throw error;
    }
  },

  async download(bucket, path) {
    const { data, error } = await client.storage.from(bucket).download(path);
    if (error !== null) {
      throw error;
    }
    if (data === null) {
      throw new Error(`Storage download returned no data: ${path}`);
    }
    return data;
  },
});

const isValidUserId = (value: string | undefined): value is string =>
  value !== undefined &&
  value.length > 0 &&
  value.trim() === value &&
  !value.includes("/");

const requireTimestamp = (value: string, label: string): number => {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError(`Invalid ${label} timestamp: ${value}`);
  }
  return milliseconds;
};

const requireLocalDate = (
  value: string,
): { year: string; month: string } => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new TypeError(`Invalid diary entry date: ${value}`);
  }
  const [, year, month] = match;
  if (year === undefined || month === undefined) {
    throw new TypeError(`Invalid diary entry date: ${value}`);
  }
  return { year, month };
};

const extensionForMimeType = (mimeType: string): string => {
  const normalized = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (normalized === "image/jpeg") {
    return "jpg";
  }
  if (normalized === "image/svg+xml") {
    return "svg";
  }

  const subtype = normalized.split("/")[1]?.split("+")[0] ?? "";
  const safe = subtype.replace(/[^a-z0-9]/g, "");
  if (safe.length === 0) {
    throw new TypeError(`Cannot derive a safe extension from ${mimeType}`);
  }
  return safe;
};

const storagePathFor = (
  userId: string,
  entryDate: string,
  asset: MediaAsset,
): string => {
  const { year, month } = requireLocalDate(entryDate);
  return `${userId}/${year}/${month}/${asset.id}.${extensionForMimeType(asset.mimeType)}`;
};

const compareMedia = (left: MediaAsset, right: MediaAsset): number =>
  left.sortOrder - right.sortOrder ||
  left.createdAt.localeCompare(right.createdAt) ||
  left.id.localeCompare(right.id);

const compareEntryRows = (
  left: DiaryEntryRow,
  right: DiaryEntryRow,
): number =>
  left.updated_at.localeCompare(right.updated_at) ||
  left.id.localeCompare(right.id);

const comparePreferenceRows = (
  left: PreferenceRow,
  right: PreferenceRow,
): number => left.updated_at.localeCompare(right.updated_at);

const compareMediaRows = (
  left: MediaAssetRow,
  right: MediaAssetRow,
): number =>
  left.entry_id.localeCompare(right.entry_id) ||
  left.sort_order - right.sort_order ||
  left.created_at.localeCompare(right.created_at) ||
  left.id.localeCompare(right.id);

const ownStoragePath = (userId: string, path: string): boolean =>
  path.startsWith(`${userId}/`) &&
  !path.split("/").some((part) => part === "..");

const optionalNumber = (value: number | null): number | undefined =>
  value === null ? undefined : value;

const mapPreference = (row: PreferenceRow): StoredPreference => {
  if (row.key !== "background") {
    throw new Error(`Unsupported preference key: ${row.key}`);
  }
  if (row.background_mode === "random") {
    return {
      key: "background",
      value: { mode: "random" },
      updatedAt: row.updated_at,
    };
  }
  if (
    row.background_mode === "pinned" &&
    row.pinned_background_asset_id !== null
  ) {
    return {
      key: "background",
      value: {
        mode: "pinned",
        pinnedAssetId: row.pinned_background_asset_id,
      },
      updatedAt: row.updated_at,
    };
  }
  throw new Error(`Invalid background preference mode: ${row.background_mode}`);
};

const latestTimestamp = (
  initial: string,
  candidates: readonly string[],
): string => {
  let latest = initial;
  let latestMilliseconds = requireTimestamp(initial, "cursor");

  for (const candidate of candidates) {
    const milliseconds = requireTimestamp(candidate, "remote update");
    if (milliseconds > latestMilliseconds) {
      latest = candidate;
      latestMilliseconds = milliseconds;
    }
  }

  return latest;
};

export class SupabaseGateway implements CloudGateway {
  private sessionPromise?: Promise<{ userId: string }>;

  constructor(private readonly dependencies: SupabaseGatewayDependencies) {}

  ensureSession(): Promise<{ userId: string }> {
    if (this.dependencies.adapter === undefined) {
      return Promise.reject(
        new CloudSessionPausedError("Supabase is not configured"),
      );
    }

    if (this.sessionPromise === undefined) {
      const pending = this.resolveSession(this.dependencies.adapter);
      this.sessionPromise = pending;
      void pending.catch(() => {
        if (this.sessionPromise === pending) {
          this.sessionPromise = undefined;
        }
      });
    }

    return this.sessionPromise;
  }

  async pushCreate(entryId: string, operationId: string): Promise<void> {
    const { userId } = await this.ensureSession();
    const entry = await this.dependencies.repository.getEntry(entryId);
    if (entry === undefined) {
      throw new Error(`Diary entry not found: ${entryId}`);
    }
    if (entry.userId !== userId) {
      throw new Error(`Diary entry is not owned by session user: ${entryId}`);
    }

    const media = (
      await this.dependencies.repository.listMediaForEntry(entryId)
    ).sort(compareMedia);
    const mediaRows: Array<Record<string, unknown>> = [];

    for (const asset of media) {
      if (asset.userId !== userId || asset.entryId !== entry.id) {
        throw new Error(`Media asset is not owned by diary entry: ${asset.id}`);
      }

      const storagePath = storagePathFor(userId, entry.entryDate, asset);
      if (asset.localBlob !== undefined) {
        await this.requireAdapter().upload(
          STORAGE_BUCKET,
          storagePath,
          asset.localBlob,
          { contentType: asset.mimeType, upsert: true },
        );
      } else if (asset.storagePath !== storagePath) {
        throw new Error(`Media asset has no uploadable blob: ${asset.id}`);
      }

      mediaRows.push({
        id: asset.id,
        user_id: userId,
        entry_id: entry.id,
        storage_path: storagePath,
        mime_type: asset.mimeType,
        width: asset.width ?? null,
        height: asset.height ?? null,
        sort_order: asset.sortOrder,
        created_at: asset.createdAt,
        updated_at: entry.updatedAt,
        deleted_at: null,
        last_operation_id: operationId,
      });
    }

    await this.requireAdapter().upsert({
      table: "diary_entries",
      onConflict: "user_id,id",
      rows: [
        {
          id: entry.id,
          user_id: userId,
          entry_date: entry.entryDate,
          text: entry.text,
          created_at: entry.createdAt,
          updated_at: entry.updatedAt,
          deleted_at: entry.deletedAt ?? null,
          last_operation_id: operationId,
        },
      ],
    });

    if (mediaRows.length > 0) {
      await this.requireAdapter().upsert({
        table: "media_assets",
        onConflict: "user_id,id",
        rows: mediaRows,
      });
    }
  }

  async pushDelete(
    entryId: string,
    deletedAt: string,
    operationId: string,
  ): Promise<void> {
    requireTimestamp(deletedAt, "deletion");
    const { userId } = await this.ensureSession();
    const adapter = this.requireAdapter();

    await adapter.update({
      table: "diary_entries",
      values: {
        deleted_at: deletedAt,
        updated_at: deletedAt,
        last_operation_id: operationId,
      },
      filters: [
        { operator: "eq", column: "id", value: entryId },
        { operator: "eq", column: "user_id", value: userId },
      ],
    });

    const localMedia =
      await this.dependencies.repository.listMediaForEntry(entryId);
    const remoteMedia = await adapter.select<MediaPathRow>({
      table: "media_assets",
      columns: "storage_path",
      filters: [
        { operator: "eq", column: "entry_id", value: entryId },
        { operator: "eq", column: "user_id", value: userId },
      ],
      order: [{ column: "storage_path", ascending: true }],
    });
    const paths = new Set<string>();

    for (const asset of localMedia) {
      if (
        asset.userId === userId &&
        asset.entryId === entryId &&
        asset.storagePath !== undefined &&
        ownStoragePath(userId, asset.storagePath)
      ) {
        paths.add(asset.storagePath);
      }
    }
    for (const row of remoteMedia) {
      if (ownStoragePath(userId, row.storage_path)) {
        paths.add(row.storage_path);
      }
    }

    if (paths.size > 0) {
      await adapter.remove(STORAGE_BUCKET, [...paths]);
    }
  }

  async pushPreference(
    preference: StoredPreference,
    operationId: string,
  ): Promise<void> {
    requireTimestamp(preference.updatedAt, "preference");
    const { userId } = await this.ensureSession();

    await this.requireAdapter().upsert({
      table: "user_preferences",
      onConflict: "user_id,key",
      rows: [
        {
          user_id: userId,
          key: preference.key,
          background_mode: preference.value.mode,
          pinned_background_asset_id:
            preference.value.mode === "pinned"
              ? preference.value.pinnedAssetId
              : null,
          updated_at: preference.updatedAt,
          deleted_at: null,
          last_operation_id: operationId,
        },
      ],
    });
  }

  async pullSince(cursor?: string): Promise<CloudPullResult> {
    const { userId } = await this.ensureSession();
    const adapter = this.requireAdapter();
    const baseCursor = cursor ?? INITIAL_CURSOR;
    requireTimestamp(baseCursor, "cursor");
    const updatedFilter: SupabaseFilter[] =
      cursor === undefined
        ? []
        : [{ operator: "gt", column: "updated_at", value: cursor }];

    const entries = (
      await adapter.select<DiaryEntryRow>({
        table: "diary_entries",
        columns:
          "id,user_id,entry_date,text,created_at,updated_at,deleted_at",
        filters: [
          { operator: "eq", column: "user_id", value: userId },
          ...updatedFilter,
        ],
        order: [
          { column: "updated_at", ascending: true },
          { column: "id", ascending: true },
        ],
      })
    ).sort(compareEntryRows);
    const preferences = (
      await adapter.select<PreferenceRow>({
        table: "user_preferences",
        columns:
          "user_id,key,background_mode,pinned_background_asset_id,updated_at,deleted_at",
        filters: [
          { operator: "eq", column: "user_id", value: userId },
          { operator: "eq", column: "key", value: "background" },
          { operator: "is", column: "deleted_at", value: null },
          ...updatedFilter,
        ],
        order: [{ column: "updated_at", ascending: true }],
      })
    ).sort(comparePreferenceRows);

    this.assertOwnRows(userId, entries);
    this.assertOwnRows(userId, preferences);

    const entryIds = entries.map((row) => row.id);
    const mediaRows =
      entryIds.length === 0
        ? []
        : (
            await adapter.select<MediaAssetRow>({
              table: "media_assets",
              columns:
                "id,user_id,entry_id,storage_path,mime_type,width,height,sort_order,created_at,updated_at,deleted_at",
              filters: [
                { operator: "eq", column: "user_id", value: userId },
                { operator: "in", column: "entry_id", value: entryIds },
                { operator: "is", column: "deleted_at", value: null },
              ],
              order: [
                { column: "entry_id", ascending: true },
                { column: "sort_order", ascending: true },
                { column: "created_at", ascending: true },
                { column: "id", ascending: true },
              ],
            })
          ).sort(compareMediaRows);

    this.assertOwnRows(userId, mediaRows);
    const entryById = new Map(entries.map((row) => [row.id, row]));
    const mediaByEntry = new Map<string, MediaAsset[]>();

    for (const row of mediaRows) {
      const parent = entryById.get(row.entry_id);
      if (parent === undefined || parent.deleted_at !== null) {
        continue;
      }
      if (!ownStoragePath(userId, row.storage_path)) {
        throw new Error(`Remote media path is not owned by user: ${row.id}`);
      }

      const localBlob = await adapter.download(
        STORAGE_BUCKET,
        row.storage_path,
      );
      const mapped: MediaAsset = {
        id: row.id,
        entryId: row.entry_id,
        userId,
        storagePath: row.storage_path,
        mimeType: row.mime_type,
        width: optionalNumber(row.width),
        height: optionalNumber(row.height),
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        localBlob,
      };
      const entryMedia = mediaByEntry.get(row.entry_id) ?? [];
      entryMedia.push(mapped);
      mediaByEntry.set(row.entry_id, entryMedia);
    }

    const mappedEntries = entries.map<DiaryEntry>((row) => ({
      id: row.id,
      userId,
      entryDate: row.entry_date,
      text: row.text ?? "",
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.deleted_at === null ? {} : { deletedAt: row.deleted_at }),
      media: (mediaByEntry.get(row.id) ?? []).sort(compareMedia),
      syncState: "synced",
    }));
    const activePreferences = preferences.filter(
      (row) => row.deleted_at === null || row.deleted_at === undefined,
    );
    const preferenceRow = activePreferences.at(-1);
    const preference =
      preferenceRow === undefined ? undefined : mapPreference(preferenceRow);
    const nextCursor = latestTimestamp(baseCursor, [
      ...entries.map((row) => row.updated_at),
      ...mediaRows.map((row) => row.updated_at),
      ...preferences.map((row) => row.updated_at),
    ]);

    return {
      entries: mappedEntries,
      ...(preference === undefined ? {} : { preferences: preference }),
      cursor: nextCursor,
    };
  }

  private async resolveSession(
    adapter: SupabaseGatewayAdapter,
  ): Promise<{ userId: string }> {
    const currentUserId = await adapter.getSessionUser();
    if (isValidUserId(currentUserId)) {
      return { userId: currentUserId };
    }

    const anonymousUserId = await adapter.signInAnonymously();
    if (!isValidUserId(anonymousUserId)) {
      throw new CloudSessionPausedError(
        "Anonymous Supabase session is unavailable",
      );
    }
    return { userId: anonymousUserId };
  }

  private requireAdapter(): SupabaseGatewayAdapter {
    const { adapter } = this.dependencies;
    if (adapter === undefined) {
      throw new CloudSessionPausedError("Supabase is not configured");
    }
    return adapter;
  }

  private assertOwnRows(
    userId: string,
    rows: ReadonlyArray<{ user_id: string }>,
  ): void {
    if (rows.some((row) => row.user_id !== userId)) {
      throw new Error("Supabase returned a row for another user");
    }
  }
}

export const createSupabaseGateway = (
  repository: SupabaseGatewayRepository,
  client: SupabaseClient | undefined,
): SupabaseGateway =>
  new SupabaseGateway({
    repository,
    adapter:
      client === undefined
        ? undefined
        : createSupabaseGatewayAdapter(client),
  });
