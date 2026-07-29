export interface DiaryEntry {
  id: string;
  userId: string;
  entryDate: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  media: MediaAsset[];
  syncState: "local" | "waiting" | "syncing" | "synced" | "failed";
}

export interface MediaAsset {
  id: string;
  entryId: string;
  userId: string;
  storagePath?: string;
  mimeType: string;
  width?: number;
  height?: number;
  sortOrder: number;
  createdAt: string;
  localBlob?: Blob;
  thumbnailBlob?: Blob;
}

export type BackgroundPreference =
  | {
      mode: "random";
      pinnedAssetId?: never;
    }
  | {
      mode: "pinned";
      pinnedAssetId: string;
    };

export interface OutboxOperation {
  id: string;
  kind: "create-entry" | "delete-entry" | "upsert-preference";
  entityId: string;
  createdAt: string;
  attempts: number;
  state: "waiting" | "syncing" | "failed";
  nextAttemptAt?: string;
  deletedAt?: string;
}

export interface StoredPreference {
  key: "background";
  value: BackgroundPreference;
  updatedAt: string;
}

export interface SyncMeta {
  key: "cursor";
  value?: string;
}
