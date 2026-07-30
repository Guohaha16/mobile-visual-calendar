import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  DiaryEntry,
  MediaAsset,
  StoredPreference,
} from "../../domain/types";
import type {
  DiaryRepository,
  MediaStoragePathUpdate,
} from "../local/diaryRepository";
import {
  CloudSessionPausedError,
  type CloudGateway,
  type CloudPullResult,
} from "./cloudGateway";

const STORAGE_BUCKET = "diary-images";
const THUMBNAIL_MAX_EDGE = 512;

export interface SupabaseEntryPayload {
  id: string;
  entry_date: string;
  text: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SupabaseMediaPayload {
  id: string;
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

export interface SupabaseApplyCreateRequest {
  operationId: string;
  entry: SupabaseEntryPayload;
  media: SupabaseMediaPayload[];
}

export interface SupabaseApplyDeleteRequest {
  operationId: string;
  entryId: string;
  deletedAt: string;
}

export interface SupabaseApplyDeleteResult {
  alreadyApplied: boolean;
  storagePaths: string[];
}

export interface SupabaseApplyPreferenceRequest {
  operationId: string;
  mode: StoredPreference["value"]["mode"];
  pinnedAssetId?: string;
  updatedAt: string;
}

export interface SupabaseOperationResult {
  alreadyApplied: boolean;
}

export type SupabaseOperationKind =
  | "create-entry"
  | "delete-entry"
  | "upsert-preference";

export type SupabaseOperationStatus =
  | "missing"
  | "pending"
  | "completed";

export interface SupabaseOperationLookup {
  operationId: string;
  operationKind: SupabaseOperationKind;
  entityId: string;
}

export interface SupabaseEntrySnapshotRow extends SupabaseEntryPayload {
  user_id: string;
}

export interface SupabaseMediaSnapshotRow extends SupabaseMediaPayload {
  user_id: string;
}

export interface SupabasePreferenceSnapshotRow {
  user_id: string;
  background_mode: string;
  pinned_background_asset_id: string | null;
  updated_at: string;
}

export interface SupabaseSnapshot {
  entries: SupabaseEntrySnapshotRow[];
  media: SupabaseMediaSnapshotRow[];
  preference: SupabasePreferenceSnapshotRow | null;
  cursor: string;
}

export interface SupabaseGatewayAdapter {
  getSessionUser(): Promise<string | undefined>;
  signInAnonymously(): Promise<string | undefined>;
  getOperationStatus(
    request: SupabaseOperationLookup,
  ): Promise<SupabaseOperationStatus>;
  upload(
    bucket: string,
    path: string,
    body: Blob,
    options: { contentType: string; upsert: boolean },
  ): Promise<void>;
  applyCreate(
    request: SupabaseApplyCreateRequest,
  ): Promise<SupabaseOperationResult>;
  applyDelete(
    request: SupabaseApplyDeleteRequest,
  ): Promise<SupabaseApplyDeleteResult>;
  applyPreference(
    request: SupabaseApplyPreferenceRequest,
  ): Promise<SupabaseOperationResult>;
  getSnapshot(cursor?: string): Promise<SupabaseSnapshot>;
  remove(bucket: string, paths: string[]): Promise<void>;
  download(bucket: string, path: string): Promise<Blob>;
}

export type SupabaseGatewayRepository = Pick<
  DiaryRepository,
  | "getEntry"
  | "getMedia"
  | "listMediaForEntry"
  | "updateMediaStoragePaths"
>;

export type ThumbnailCreator = (
  blob: Blob,
  mimeType: string,
) => Promise<Blob | undefined>;

export interface SupabaseGatewayDependencies {
  adapter: SupabaseGatewayAdapter | undefined;
  repository: SupabaseGatewayRepository;
  createThumbnail?: ThumbnailCreator;
}

interface RawRpcResult {
  data: unknown;
  error: unknown;
}

interface RawRpcClient {
  rpc(
    functionName: string,
    parameters?: Record<string, unknown>,
  ): PromiseLike<RawRpcResult>;
}

interface CanvasSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  dispose(): void;
}

const throwOnError = (result: RawRpcResult): void => {
  if (result.error !== null && result.error !== undefined) {
    throw result.error;
  }
};

const rpc = async (
  client: SupabaseClient,
  functionName: string,
  parameters?: Record<string, unknown>,
): Promise<unknown> => {
  const result = await (client as unknown as RawRpcClient).rpc(
    functionName,
    parameters,
  );
  throwOnError(result);
  return result.data;
};

const requireObject = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} RPC returned an invalid result`);
  }
  return value as Record<string, unknown>;
};

const parseOperationResult = (
  value: unknown,
  label: string,
): SupabaseOperationResult => {
  const result = requireObject(value, label);
  if (typeof result.already_applied !== "boolean") {
    throw new Error(`${label} RPC omitted already_applied`);
  }
  return { alreadyApplied: result.already_applied };
};

const parseOperationStatus = (
  value: unknown,
): SupabaseOperationStatus => {
  if (
    value !== "missing" &&
    value !== "pending" &&
    value !== "completed"
  ) {
    throw new Error("Operation lookup RPC returned an invalid status");
  }
  return value;
};

const parseDeleteResult = (value: unknown): SupabaseApplyDeleteResult => {
  const result = requireObject(value, "Delete");
  if (
    typeof result.already_applied !== "boolean" ||
    !Array.isArray(result.storage_paths) ||
    !result.storage_paths.every((path) => typeof path === "string")
  ) {
    throw new Error("Delete RPC returned an invalid result");
  }
  return {
    alreadyApplied: result.already_applied,
    storagePaths: result.storage_paths,
  };
};

const parseSnapshot = (value: unknown): SupabaseSnapshot => {
  const result = requireObject(value, "Snapshot");
  if (
    !Array.isArray(result.entries) ||
    !Array.isArray(result.media) ||
    !(
      result.preference === null ||
      (typeof result.preference === "object" &&
        !Array.isArray(result.preference))
    ) ||
    typeof result.cursor !== "string" ||
    result.cursor.length === 0
  ) {
    throw new Error("Snapshot RPC returned an invalid result");
  }

  return {
    entries: result.entries as SupabaseEntrySnapshotRow[],
    media: result.media as SupabaseMediaSnapshotRow[],
    preference:
      result.preference as SupabasePreferenceSnapshotRow | null,
    cursor: result.cursor,
  };
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

  async getOperationStatus(request) {
    const data = await rpc(client, "visual_diary_get_operation_status", {
      p_operation_id: request.operationId,
      p_operation_kind: request.operationKind,
      p_entity_id: request.entityId,
    });
    return parseOperationStatus(data);
  },

  async upload(bucket, path, body, options) {
    const { error } = await client.storage
      .from(bucket)
      .upload(path, body, options);
    if (error !== null) {
      throw error;
    }
  },

  async applyCreate(request) {
    const data = await rpc(client, "visual_diary_apply_create", {
      p_operation_id: request.operationId,
      p_entry: request.entry,
      p_media: request.media,
    });
    return parseOperationResult(data, "Create");
  },

  async applyDelete(request) {
    const data = await rpc(client, "visual_diary_apply_delete", {
      p_operation_id: request.operationId,
      p_entry_id: request.entryId,
      p_deleted_at: request.deletedAt,
    });
    return parseDeleteResult(data);
  },

  async applyPreference(request) {
    const data = await rpc(client, "visual_diary_apply_preference", {
      p_operation_id: request.operationId,
      p_background_mode: request.mode,
      p_pinned_background_asset_id: request.pinnedAssetId ?? null,
      p_updated_at: request.updatedAt,
    });
    return parseOperationResult(data, "Preference");
  },

  async getSnapshot(cursor) {
    const data = await rpc(client, "visual_diary_snapshot", {
      p_cursor: cursor ?? null,
    });
    return parseSnapshot(data);
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

const boundedDimensions = (
  width: number,
  height: number,
): { width: number; height: number } => {
  const scale = Math.min(1, THUMBNAIL_MAX_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const decodeWithImageBitmap = async (
  blob: Blob,
): Promise<CanvasSource | undefined> => {
  if (typeof globalThis.createImageBitmap !== "function") {
    return undefined;
  }
  const bitmap = await globalThis.createImageBitmap(blob);
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    dispose: () => bitmap.close(),
  };
};

const decodeWithImageElement = async (
  blob: Blob,
): Promise<CanvasSource | undefined> => {
  if (
    typeof Image !== "function" ||
    typeof URL.createObjectURL !== "function" ||
    typeof URL.revokeObjectURL !== "function"
  ) {
    return undefined;
  }

  const image = new Image();
  if (typeof image.decode !== "function") {
    return undefined;
  }
  const objectUrl = URL.createObjectURL(blob);
  image.src = objectUrl;
  try {
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
};

const renderOffscreenThumbnail = async (
  decoded: CanvasSource,
  width: number,
  height: number,
): Promise<Blob | undefined> => {
  if (typeof OffscreenCanvas !== "function") {
    return undefined;
  }
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (context === null) {
    return undefined;
  }
  context.drawImage(decoded.source, 0, 0, width, height);
  return canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
};

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type: "image/webp" | "image/jpeg",
): Promise<Blob | undefined> =>
  new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? undefined), type, 0.82);
  });

const renderHtmlThumbnail = async (
  decoded: CanvasSource,
  width: number,
  height: number,
): Promise<Blob | undefined> => {
  if (typeof document === "undefined") {
    return undefined;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (context === null) {
    return undefined;
  }
  context.drawImage(decoded.source, 0, 0, width, height);
  return (
    (await canvasToBlob(canvas, "image/webp")) ??
    (await canvasToBlob(canvas, "image/jpeg"))
  );
};

export const createBrowserThumbnail: ThumbnailCreator = async (
  blob,
  mimeType,
) => {
  if (!mimeType.startsWith("image/")) {
    return undefined;
  }

  let decoded: CanvasSource | undefined;
  try {
    decoded =
      (await decodeWithImageBitmap(blob)) ??
      (await decodeWithImageElement(blob));
    if (
      decoded === undefined ||
      decoded.width <= 0 ||
      decoded.height <= 0
    ) {
      return undefined;
    }

    const dimensions = boundedDimensions(decoded.width, decoded.height);
    return (
      (await renderOffscreenThumbnail(
        decoded,
        dimensions.width,
        dimensions.height,
      )) ??
      (await renderHtmlThumbnail(
        decoded,
        dimensions.width,
        dimensions.height,
      ))
    );
  } catch {
    return undefined;
  } finally {
    decoded?.dispose();
  }
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const IMAGE_MIME_PATTERN = /^image\/[a-z0-9][a-z0-9.+-]*$/;
const STORAGE_FILENAME_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z0-9]+$/;

const isCanonicalUuid = (value: string): boolean =>
  UUID_PATTERN.test(value);

const requireUuid = (value: string, label: string): void => {
  if (!isCanonicalUuid(value)) {
    throw new TypeError(`Invalid ${label} UUID: ${value}`);
  }
};

const isValidUserId = (value: string | undefined): value is string =>
  value !== undefined && isCanonicalUuid(value);

const isValidCalendarDate = (
  year: number,
  month: number,
  day: number,
): boolean => {
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1
  ) {
    return false;
  }
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const requireTimestamp = (value: string, label: string): void => {
  const match = TIMESTAMP_PATTERN.exec(value);
  if (
    match === null ||
    !isValidCalendarDate(
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
    ) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new TypeError(`Invalid ${label} timestamp: ${value}`);
  }
};

const requireLocalDate = (
  value: string,
): { year: string; month: string } => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new TypeError(`Invalid diary entry date: ${value}`);
  }
  const [, year, month, day] = match;
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    !isValidCalendarDate(Number(year), Number(month), Number(day))
  ) {
    throw new TypeError(`Invalid diary entry date: ${value}`);
  }
  return { year, month };
};

const requireDimension = (
  value: number | undefined,
  label: string,
): void => {
  if (
    value !== undefined &&
    (!Number.isInteger(value) || value <= 0)
  ) {
    throw new TypeError(`Invalid media ${label}: ${value}`);
  }
};

const requireDimensionPair = (asset: MediaAsset): void => {
  if ((asset.width === undefined) !== (asset.height === undefined)) {
    throw new TypeError("Media width and height must be provided together");
  }
};

const requireSortOrder = (value: number): void => {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`Invalid media sort order: ${value}`);
  }
};

const requireImageMimeType = (value: string): void => {
  if (!IMAGE_MIME_PATTERN.test(value)) {
    throw new TypeError(`Invalid image MIME type: ${value}`);
  }
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
  left: SupabaseEntrySnapshotRow,
  right: SupabaseEntrySnapshotRow,
): number =>
  left.updated_at.localeCompare(right.updated_at) ||
  left.id.localeCompare(right.id);

const compareMediaRows = (
  left: SupabaseMediaSnapshotRow,
  right: SupabaseMediaSnapshotRow,
): number =>
  left.entry_id.localeCompare(right.entry_id) ||
  left.sort_order - right.sort_order ||
  left.created_at.localeCompare(right.created_at) ||
  left.id.localeCompare(right.id);

const ownStoragePath = (userId: string, path: string): boolean => {
  const parts = path.split("/");
  if (parts.length !== 4) {
    return false;
  }
  const [ownerId, year, month, filename] = parts;
  return (
    ownerId === userId &&
    /^\d{4}$/.test(year ?? "") &&
    /^(0[1-9]|1[0-2])$/.test(month ?? "") &&
    STORAGE_FILENAME_PATTERN.test(filename ?? "")
  );
};

const optionalNumber = (value: number | null): number | undefined =>
  value === null ? undefined : value;

const mapPreference = (
  row: SupabasePreferenceSnapshotRow,
): StoredPreference => {
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

const errorStringProperty = (
  error: object,
  property: "name" | "code" | "message",
): string => {
  const value = Reflect.get(error, property);
  return typeof value === "string" ? value : "";
};

const errorStatus = (error: object): number | undefined => {
  const value = Reflect.get(error, "status");
  return typeof value === "number" ? value : undefined;
};

const isExplicitTerminalAuthName = (name: string): boolean =>
  name.startsWith("Auth") &&
  name !== "AuthApiError" &&
  name !== "AuthRetryableFetchError" &&
  name !== "AuthUnknownError";

const isRetryableAuthAdapterError = (error: object): boolean => {
  const name = errorStringProperty(error, "name");
  const code = errorStringProperty(error, "code").toLowerCase();
  const message = errorStringProperty(error, "message");
  const status = errorStatus(error);
  if (
    name === "AuthRetryableFetchError" ||
    /(?:network|fetch|timeout|temporar|unavailable|rate.?limit)/i.test(
      `${code} ${message}`,
    )
  ) {
    return true;
  }
  if (isExplicitTerminalAuthName(name)) {
    return false;
  }
  return (
    status === 0 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (status !== undefined && status >= 500)
  );
};

const isTerminalAuthAdapterError = (error: unknown): boolean => {
  if (error === null || typeof error !== "object") {
    return false;
  }
  if (isRetryableAuthAdapterError(error)) {
    return false;
  }

  const name = errorStringProperty(error, "name");
  const code = errorStringProperty(error, "code");
  const message = errorStringProperty(error, "message");
  const status = errorStatus(error);
  return (
    name.startsWith("Auth") ||
    status === 401 ||
    status === 403 ||
    /(?:session|refresh.?token|jwt|auth).*(?:missing|expired|invalid|not.?found|revoked)/i.test(
      `${code} ${message}`,
    )
  );
};

const rethrowSessionAdapterError = (
  error: unknown,
  action: "read" | "create",
): never => {
  if (isTerminalAuthAdapterError(error)) {
    throw new CloudSessionPausedError(
      `Supabase session ${action} requires authentication recovery`,
      { cause: error },
    );
  }
  throw error;
};

export class SupabaseGateway implements CloudGateway {
  private sessionPromise?: Promise<{ userId: string }>;
  private establishedUserId?: string;

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
      void pending.then(
        () => {
          if (this.sessionPromise === pending) {
            this.sessionPromise = undefined;
          }
        },
        () => {
          if (this.sessionPromise === pending) {
            this.sessionPromise = undefined;
          }
        },
      );
    }

    return this.sessionPromise;
  }

  async pushCreate(entryId: string, operationId: string): Promise<void> {
    requireUuid(entryId, "entry");
    const { userId } = await this.ensureSession();
    const entry = await this.dependencies.repository.getEntry(entryId);
    if (entry === undefined) {
      throw new Error(`Diary entry not found: ${entryId}`);
    }
    if (entry.userId !== userId) {
      throw new Error(`Diary entry is not owned by session user: ${entryId}`);
    }
    requireUuid(entry.id, "entry");
    requireUuid(entry.userId, "entry user");
    requireLocalDate(entry.entryDate);
    requireTimestamp(entry.createdAt, "entry creation");
    requireTimestamp(entry.updatedAt, "entry update");
    if (entry.deletedAt !== undefined) {
      requireTimestamp(entry.deletedAt, "entry deletion");
    }

    const media = (
      await this.dependencies.repository.listMediaForEntry(entryId)
    ).sort(compareMedia);
    const mediaPayload: SupabaseMediaPayload[] = [];
    const storageUpdates: MediaStoragePathUpdate[] = [];

    for (const asset of media) {
      if (asset.userId !== userId || asset.entryId !== entry.id) {
        throw new Error(`Media asset is not owned by diary entry: ${asset.id}`);
      }
      requireUuid(asset.id, "media");
      requireUuid(asset.entryId, "media entry");
      requireUuid(asset.userId, "media user");
      requireTimestamp(asset.createdAt, "media creation");
      requireDimension(asset.width, "width");
      requireDimension(asset.height, "height");
      requireDimensionPair(asset);
      requireSortOrder(asset.sortOrder);
      requireImageMimeType(asset.mimeType);
      const storagePath = storagePathFor(userId, entry.entryDate, asset);
      if (
        asset.storagePath !== undefined &&
        asset.storagePath !== storagePath
      ) {
        throw new TypeError(
          `Media asset has an invalid cloud storage path: ${asset.id}`,
        );
      }
      if (
        asset.localBlob === undefined &&
        asset.storagePath !== storagePath
      ) {
        throw new Error(`Media asset has no uploadable blob: ${asset.id}`);
      }
      mediaPayload.push({
        id: asset.id,
        entry_id: entry.id,
        storage_path: storagePath,
        mime_type: asset.mimeType,
        width: asset.width ?? null,
        height: asset.height ?? null,
        sort_order: asset.sortOrder,
        created_at: asset.createdAt,
        updated_at: entry.updatedAt,
        deleted_at: null,
      });
      if (
        asset.storagePath !== storagePath ||
        asset.localBlob !== undefined
      ) {
        storageUpdates.push({ id: asset.id, storagePath });
      }
    }

    const adapter = this.requireAdapter();
    const operationStatus = await adapter.getOperationStatus({
      operationId,
      operationKind: "create-entry",
      entityId: entry.id,
    });
    if (operationStatus === "pending") {
      throw new Error("Operation ledger contains an incomplete create");
    }
    if (operationStatus === "missing") {
      for (let index = 0; index < media.length; index += 1) {
        const asset = media[index];
        const payload = mediaPayload[index];
        if (asset === undefined || payload === undefined) {
          throw new Error("Media payload construction failed");
        }
        if (asset.localBlob !== undefined) {
          await adapter.upload(
            STORAGE_BUCKET,
            payload.storage_path,
            asset.localBlob,
            { contentType: asset.mimeType, upsert: true },
          );
        } else if (asset.storagePath !== payload.storage_path) {
          throw new Error(`Media asset has no uploadable blob: ${asset.id}`);
        }
      }

      await adapter.applyCreate({
        operationId,
        entry: {
          id: entry.id,
          entry_date: entry.entryDate,
          text: entry.text,
          created_at: entry.createdAt,
          updated_at: entry.updatedAt,
          deleted_at: entry.deletedAt ?? null,
        },
        media: mediaPayload,
      });
    }

    if (storageUpdates.length > 0) {
      await this.dependencies.repository.updateMediaStoragePaths(
        storageUpdates,
      );
    }
  }

  async pushDelete(
    entryId: string,
    deletedAt: string,
    operationId: string,
  ): Promise<void> {
    requireUuid(entryId, "entry");
    requireTimestamp(deletedAt, "deletion");
    const { userId } = await this.ensureSession();
    const adapter = this.requireAdapter();
    const operationStatus = await adapter.getOperationStatus({
      operationId,
      operationKind: "delete-entry",
      entityId: entryId,
    });
    if (operationStatus === "pending") {
      throw new Error("Operation ledger contains an incomplete delete");
    }
    const result = await adapter.applyDelete({
      operationId,
      entryId,
      deletedAt,
    });
    const localMedia =
      await this.dependencies.repository.listMediaForEntry(entryId);
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
    for (const path of result.storagePaths) {
      if (ownStoragePath(userId, path)) {
        paths.add(path);
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
    if (preference.value.mode === "pinned") {
      requireUuid(preference.value.pinnedAssetId, "pinned media");
    }
    await this.ensureSession();

    const adapter = this.requireAdapter();
    const operationStatus = await adapter.getOperationStatus({
      operationId,
      operationKind: "upsert-preference",
      entityId: preference.key,
    });
    if (operationStatus === "pending") {
      throw new Error("Operation ledger contains an incomplete preference");
    }
    if (operationStatus === "completed") {
      return;
    }

    await adapter.applyPreference({
      operationId,
      mode: preference.value.mode,
      ...(preference.value.mode === "pinned"
        ? { pinnedAssetId: preference.value.pinnedAssetId }
        : {}),
      updatedAt: preference.updatedAt,
    });
  }

  async pullSince(cursor?: string): Promise<CloudPullResult> {
    const { userId } = await this.ensureSession();
    const adapter = this.requireAdapter();

    // The RPC intentionally returns a complete transaction-consistent snapshot.
    // Cursor is a server high-water mark for diagnostics/future CDC, not filtering.
    const snapshot = await adapter.getSnapshot(cursor);
    this.assertOwnRows(userId, snapshot.entries);
    this.assertOwnRows(userId, snapshot.media);
    if (
      snapshot.preference !== null &&
      snapshot.preference.user_id !== userId
    ) {
      throw new Error("Supabase returned a preference for another user");
    }

    const entries = [...snapshot.entries].sort(compareEntryRows);
    const mediaRows = [...snapshot.media].sort(compareMediaRows);
    const entryById = new Map(entries.map((row) => [row.id, row]));
    const mediaByEntry = new Map<string, MediaAsset[]>();

    for (const row of mediaRows) {
      const parent = entryById.get(row.entry_id);
      if (parent === undefined) {
        throw new Error(`Remote media has no snapshot entry: ${row.id}`);
      }
      if (parent.deleted_at !== null || row.deleted_at !== null) {
        continue;
      }
      if (!ownStoragePath(userId, row.storage_path)) {
        throw new Error(`Remote media path is not owned by user: ${row.id}`);
      }

      const localAsset =
        await this.dependencies.repository.getMedia(row.id);
      let thumbnailBlob =
        localAsset?.userId === userId &&
        localAsset.entryId === row.entry_id
          ? localAsset.thumbnailBlob
          : undefined;
      if (thumbnailBlob === undefined) {
        try {
          const downloaded = await adapter.download(
            STORAGE_BUCKET,
            row.storage_path,
          );
          thumbnailBlob = await (
            this.dependencies.createThumbnail ?? createBrowserThumbnail
          )(downloaded, row.mime_type);
        } catch {
          // Preserve the snapshot even when one private object is missing.
        }
      }
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
        ...(thumbnailBlob === undefined ? {} : { thumbnailBlob }),
      };
      const entryMedia = mediaByEntry.get(row.entry_id) ?? [];
      entryMedia.push(mapped);
      mediaByEntry.set(row.entry_id, entryMedia);
    }

    const mappedEntries = entries.map<DiaryEntry>((row) => ({
      id: row.id,
      userId,
      entryDate: row.entry_date,
      text: row.text,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.deleted_at === null ? {} : { deletedAt: row.deleted_at }),
      media: (mediaByEntry.get(row.id) ?? []).sort(compareMedia),
      syncState: "synced",
    }));
    const preference =
      snapshot.preference === null
        ? undefined
        : mapPreference(snapshot.preference);

    return {
      entries: mappedEntries,
      ...(preference === undefined ? {} : { preferences: preference }),
      cursor: snapshot.cursor,
    };
  }

  private async resolveSession(
    adapter: SupabaseGatewayAdapter,
  ): Promise<{ userId: string }> {
    let currentUserId: string | undefined;
    try {
      currentUserId = await adapter.getSessionUser();
    } catch (error) {
      rethrowSessionAdapterError(error, "read");
    }
    if (isValidUserId(currentUserId)) {
      if (
        this.establishedUserId !== undefined &&
        currentUserId !== this.establishedUserId
      ) {
        throw new CloudSessionPausedError(
          "Supabase session identity changed",
        );
      }
      this.establishedUserId = currentUserId;
      return { userId: currentUserId };
    }
    if (currentUserId !== undefined) {
      throw new CloudSessionPausedError(
        "Supabase session has an invalid identity",
      );
    }

    if (this.establishedUserId !== undefined) {
      throw new CloudSessionPausedError("Supabase session was lost");
    }

    let anonymousUserId: string | undefined;
    try {
      anonymousUserId = await adapter.signInAnonymously();
    } catch (error) {
      rethrowSessionAdapterError(error, "create");
    }
    if (!isValidUserId(anonymousUserId)) {
      throw new CloudSessionPausedError(
        "Anonymous Supabase session is unavailable",
      );
    }
    this.establishedUserId = anonymousUserId;
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
  createThumbnail: ThumbnailCreator = createBrowserThumbnail,
): SupabaseGateway =>
  new SupabaseGateway({
    repository,
    adapter:
      client === undefined
        ? undefined
        : createSupabaseGatewayAdapter(client),
    createThumbnail,
  });
