import Dexie, { type EntityTable } from "dexie";

import type {
  DiaryEntry,
  MediaAsset,
  OutboxOperation,
  StoredPreference,
  SyncMeta,
} from "../../domain/types";

export const VISUAL_DIARY_SCHEMA_V1 = {
  entries: "id, entryDate, createdAt, updatedAt, deletedAt, syncState",
  media: "id, entryId, userId, createdAt, storagePath",
  outbox: "id, kind, createdAt, nextAttemptAt, state",
  preferences: "key, updatedAt",
  syncMeta: "key",
} as const;

const userScopedDatabaseName = (baseName: string, userId: string): string =>
  `${baseName}::user:${encodeURIComponent(userId)}`;

export class VisualDiaryDb extends Dexie {
  entries!: EntityTable<DiaryEntry, "id">;
  media!: EntityTable<MediaAsset, "id">;
  outbox!: EntityTable<OutboxOperation, "id">;
  preferences!: EntityTable<StoredPreference, "key">;
  syncMeta!: EntityTable<SyncMeta, "key">;

  constructor(
    baseName: string,
    readonly ownerId: string,
  ) {
    super(userScopedDatabaseName(baseName, ownerId));
    this.version(1).stores(VISUAL_DIARY_SCHEMA_V1);
  }
}

export const createVisualDiaryDb = (
  baseName: string,
  userId: string,
): VisualDiaryDb => new VisualDiaryDb(baseName, userId);
