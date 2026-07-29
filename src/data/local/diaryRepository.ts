import type {
  BackgroundPreference,
  DiaryEntry,
  MediaAsset,
  OutboxOperation,
  StoredPreference,
} from "../../domain/types";
import type { VisualDiaryDb } from "./db";

export type CreateMediaInput = Omit<
  MediaAsset,
  "id" | "entryId" | "userId" | "createdAt" | "sortOrder"
> & {
  sortOrder?: number;
};

export interface CreateEntryInput {
  entryDate: string;
  text: string;
  media: CreateMediaInput[];
}

export interface DiaryRepositoryDependencies {
  userId: string;
  clock: () => string;
  generateId: () => string;
}

export type OutboxRetryUpdate = Partial<
  Pick<OutboxOperation, "state" | "attempts" | "nextAttemptAt">
>;

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const isValidLocalDateKey = (value: string): boolean => {
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (match === null) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) {
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

const assertLocalDateKey = (value: string): void => {
  if (!isValidLocalDateKey(value)) {
    throw new TypeError(`Invalid local date key: ${value}`);
  }
};

const timestampMillis = (timestamp: string, label: string): number => {
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError(`Invalid ${label} timestamp: ${timestamp}`);
  }
  return milliseconds;
};

const yearKey = (year: number): string => {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError(`Invalid diary year: ${year}`);
  }

  return String(year).padStart(4, "0");
};

const compareEntries = (left: DiaryEntry, right: DiaryEntry): number =>
  left.entryDate.localeCompare(right.entryDate) ||
  left.createdAt.localeCompare(right.createdAt) ||
  left.id.localeCompare(right.id);

const compareSameDateEntries = (left: DiaryEntry, right: DiaryEntry): number =>
  left.createdAt.localeCompare(right.createdAt) ||
  left.id.localeCompare(right.id);

const compareMedia = (left: MediaAsset, right: MediaAsset): number =>
  left.sortOrder - right.sortOrder ||
  left.createdAt.localeCompare(right.createdAt) ||
  left.id.localeCompare(right.id);

const isDiaryImage = (asset: MediaAsset): boolean =>
  asset.mimeType.startsWith("image/");

export class DiaryRepository {
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly database: VisualDiaryDb,
    private readonly dependencies: DiaryRepositoryDependencies,
  ) {
    if (database.ownerId !== dependencies.userId) {
      throw new Error(
        `Repository user ${dependencies.userId} does not match database owner ${database.ownerId}`,
      );
    }
  }

  async createEntry(input: CreateEntryInput): Promise<DiaryEntry> {
    assertLocalDateKey(input.entryDate);

    const createdAt = this.dependencies.clock();
    const entryId = this.dependencies.generateId();
    const media = input.media
      .map<MediaAsset>((asset, index) => ({
        ...asset,
        id: this.dependencies.generateId(),
        entryId,
        userId: this.dependencies.userId,
        sortOrder: asset.sortOrder ?? index,
        createdAt,
      }))
      .sort(compareMedia);
    const entry: DiaryEntry = {
      id: entryId,
      userId: this.dependencies.userId,
      entryDate: input.entryDate,
      text: input.text,
      createdAt,
      updatedAt: createdAt,
      media,
      syncState: "waiting",
    };
    const operationId = this.dependencies.generateId();

    await this.database.transaction(
      "rw",
      this.database.entries,
      this.database.media,
      this.database.outbox,
      async () => {
        await this.database.entries.add({ ...entry, media: [] });
        if (media.length > 0) {
          await this.database.media.bulkAdd(media);
        }
        await this.database.outbox.add({
          id: operationId,
          kind: "create-entry",
          entityId: entry.id,
          createdAt: await this.allocateOutboxCreatedAt(createdAt),
          attempts: 0,
          state: "waiting",
        });
      },
    );

    this.notifyMutation();
    return entry;
  }

  async deleteEntry(id: string, deletedAt: string): Promise<void> {
    const operationClock = this.dependencies.clock();

    await this.database.transaction(
      "rw",
      this.database.entries,
      this.database.outbox,
      async () => {
        const entry = await this.database.entries.get(id);
        if (entry === undefined || entry.userId !== this.dependencies.userId) {
          throw new Error(`Diary entry not found: ${id}`);
        }

        await this.database.entries.update(id, {
          deletedAt,
          updatedAt: deletedAt,
          syncState: "waiting",
        });
        await this.database.outbox.add({
          id: this.dependencies.generateId(),
          kind: "delete-entry",
          entityId: id,
          createdAt: await this.allocateOutboxCreatedAt(operationClock),
          deletedAt,
          attempts: 0,
          state: "waiting",
        });
      },
    );

    this.notifyMutation();
  }

  async getEntry(id: string): Promise<DiaryEntry | undefined> {
    const entry = await this.database.entries.get(id);
    if (entry === undefined || entry.userId !== this.dependencies.userId) {
      return undefined;
    }

    return this.hydrateEntry(entry);
  }

  async getMedia(id: string): Promise<MediaAsset | undefined> {
    const media = await this.database.media.get(id);
    return media?.userId === this.dependencies.userId ? media : undefined;
  }

  async listMediaForEntry(entryId: string): Promise<MediaAsset[]> {
    const media = await this.database.media.where("entryId").equals(entryId).toArray();
    return media
      .filter((asset) => asset.userId === this.dependencies.userId)
      .sort(compareMedia);
  }

  async listEntriesForDate(date: string): Promise<DiaryEntry[]> {
    assertLocalDateKey(date);

    const entries = await this.database.entries
      .where("entryDate")
      .equals(date)
      .toArray();
    const visibleEntries = entries
      .filter(
        (entry) =>
          entry.userId === this.dependencies.userId &&
          entry.deletedAt === undefined,
      )
      .sort(compareSameDateEntries);

    return this.hydrateEntries(visibleEntries);
  }

  async listEntriesForYear(year: number): Promise<DiaryEntry[]> {
    const prefix = `${yearKey(year)}-`;
    const entries = await this.database.entries
      .where("entryDate")
      .startsWith(prefix)
      .toArray();

    const ownedEntries = entries.filter(
      (entry) => entry.userId === this.dependencies.userId,
    );

    for (const entry of ownedEntries) {
      assertLocalDateKey(entry.entryDate);
    }

    const visibleEntries = ownedEntries
      .filter((entry) => entry.deletedAt === undefined)
      .sort(compareEntries);

    return this.hydrateEntries(visibleEntries);
  }

  async listYearImages(year: number): Promise<MediaAsset[]> {
    const entries = await this.listEntriesForYear(year);
    return entries.flatMap((entry) => entry.media.filter(isDiaryImage));
  }

  async listDiaryImages(): Promise<MediaAsset[]> {
    const entries = await this.database.entries.toArray();
    const ownedEntries = entries.filter(
      (entry) => entry.userId === this.dependencies.userId,
    );

    for (const entry of ownedEntries) {
      assertLocalDateKey(entry.entryDate);
    }

    const visibleEntries = ownedEntries
      .filter((entry) => entry.deletedAt === undefined)
      .sort(compareEntries);
    const hydratedEntries = await this.hydrateEntries(visibleEntries);

    return hydratedEntries.flatMap((entry) =>
      entry.media.filter(isDiaryImage),
    );
  }

  async getBackgroundPreference(): Promise<
    BackgroundPreference | undefined
  > {
    return (await this.getStoredBackgroundPreference())?.value;
  }

  async getStoredBackgroundPreference(): Promise<
    StoredPreference | undefined
  > {
    return this.database.preferences.get("background");
  }

  async setBackgroundPreference(
    value: BackgroundPreference,
    updatedAt?: string,
  ): Promise<StoredPreference> {
    const preferenceTimestamp = updatedAt ?? this.dependencies.clock();
    const preference: StoredPreference = {
      key: "background",
      value,
      updatedAt: preferenceTimestamp,
    };
    const operationId = this.dependencies.generateId();

    await this.database.transaction(
      "rw",
      this.database.preferences,
      this.database.outbox,
      async () => {
        await this.database.preferences.put(preference);
        const operationCreatedAt =
          await this.allocateOutboxCreatedAt(preferenceTimestamp);
        const pendingPreferenceOperations = await this.database.outbox
          .where("kind")
          .equals("upsert-preference")
          .filter((operation) => operation.state !== "syncing")
          .toArray();
        if (pendingPreferenceOperations.length > 0) {
          await this.database.outbox.bulkDelete(
            pendingPreferenceOperations.map((operation) => operation.id),
          );
        }
        await this.database.outbox.add({
          id: operationId,
          kind: "upsert-preference",
          entityId: preference.key,
          createdAt: operationCreatedAt,
          attempts: 0,
          state: "waiting",
        });
      },
    );

    this.notifyMutation();
    return preference;
  }

  async listOutbox(): Promise<OutboxOperation[]> {
    return this.database.outbox.orderBy("createdAt").toArray();
  }

  async getOutboxOperation(
    id: string,
  ): Promise<OutboxOperation | undefined> {
    return this.database.outbox.get(id);
  }

  async beginOutboxOperation(
    id: string,
    now: string,
    leaseUntil: string,
  ): Promise<OutboxOperation | undefined> {
    const nowMillis = timestampMillis(now, "now");
    const leaseUntilMillis = timestampMillis(leaseUntil, "lease");
    if (leaseUntilMillis <= nowMillis) {
      throw new RangeError("Lease must end after now");
    }

    return this.database.transaction(
      "rw",
      this.database.outbox,
      this.database.entries,
      async () => {
        const operation = await this.database.outbox.get(id);
        if (operation === undefined) {
          return undefined;
        }

        if (
          (operation.state === "failed" || operation.state === "syncing") &&
          operation.nextAttemptAt !== undefined &&
          timestampMillis(operation.nextAttemptAt, "next attempt") > nowMillis
        ) {
          return undefined;
        }

        await this.database.outbox.update(id, {
          state: "syncing",
          nextAttemptAt: leaseUntil,
        });
        await this.updateAssociatedEntrySyncState(operation, "syncing");
        return this.database.outbox.get(id);
      },
    );
  }

  async completeOutboxOperation(id: string): Promise<void> {
    await this.database.transaction(
      "rw",
      this.database.outbox,
      this.database.entries,
      async () => {
        const operation = await this.database.outbox.get(id);
        if (operation === undefined) {
          return;
        }

        await this.updateAssociatedEntrySyncState(operation, "synced");
        await this.database.outbox.delete(id);
      },
    );
  }

  async failOutboxOperation(
    id: string,
    attempts: number,
    nextAttemptAt: string,
  ): Promise<void> {
    timestampMillis(nextAttemptAt, "next attempt");
    if (!Number.isInteger(attempts) || attempts < 0) {
      throw new RangeError(`Invalid outbox attempt count: ${attempts}`);
    }

    await this.database.transaction(
      "rw",
      this.database.outbox,
      this.database.entries,
      async () => {
        const operation = await this.database.outbox.get(id);
        if (operation === undefined) {
          return;
        }

        await this.database.outbox.update(id, {
          state: "failed",
          attempts,
          nextAttemptAt,
        });
        await this.updateAssociatedEntrySyncState(operation, "failed");
      },
    );
  }

  async updateOutboxOperation(
    id: string,
    update: OutboxRetryUpdate,
  ): Promise<void> {
    const updated = await this.database.outbox.update(id, update);
    if (updated === 0) {
      throw new Error(`Outbox operation not found: ${id}`);
    }
  }

  async removeOutboxOperation(id: string): Promise<void> {
    await this.database.outbox.delete(id);
  }

  async updateEntrySyncState(
    id: string,
    syncState: DiaryEntry["syncState"],
  ): Promise<void> {
    const entry = await this.database.entries.get(id);
    if (entry === undefined || entry.userId !== this.dependencies.userId) {
      throw new Error(`Diary entry not found: ${id}`);
    }

    await this.database.entries.update(id, { syncState });
  }

  async getSyncCursor(): Promise<string | undefined> {
    return (await this.database.syncMeta.get("cursor"))?.value;
  }

  async setSyncCursor(value: string): Promise<void> {
    await this.database.syncMeta.put({ key: "cursor", value });
  }

  subscribeToMutations(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async hydrateEntry(entry: DiaryEntry): Promise<DiaryEntry> {
    const hydrated = await this.hydrateEntries([entry]);
    return hydrated[0] ?? { ...entry, media: [] };
  }

  private async hydrateEntries(entries: DiaryEntry[]): Promise<DiaryEntry[]> {
    if (entries.length === 0) {
      return [];
    }

    const entryIds = entries.map((entry) => entry.id);
    const media = await this.database.media
      .where("entryId")
      .anyOf(entryIds)
      .toArray();
    const mediaByEntry = new Map<string, MediaAsset[]>();

    for (const asset of media
      .filter((item) => item.userId === this.dependencies.userId)
      .sort(compareMedia)) {
      const entryMedia = mediaByEntry.get(asset.entryId) ?? [];
      entryMedia.push(asset);
      mediaByEntry.set(asset.entryId, entryMedia);
    }

    return entries.map((entry) => ({
      ...entry,
      media: mediaByEntry.get(entry.id) ?? [],
    }));
  }

  private async allocateOutboxCreatedAt(
    clockTimestamp: string,
  ): Promise<string> {
    const clockMillis = timestampMillis(clockTimestamp, "clock");

    const latestOperation = await this.database.outbox
      .orderBy("createdAt")
      .last();
    if (latestOperation === undefined) {
      return new Date(clockMillis).toISOString();
    }

    const latestMillis = timestampMillis(
      latestOperation.createdAt,
      "persisted outbox",
    );

    return new Date(
      clockMillis <= latestMillis ? latestMillis + 1 : clockMillis,
    ).toISOString();
  }

  private async updateAssociatedEntrySyncState(
    operation: OutboxOperation,
    syncState: DiaryEntry["syncState"],
  ): Promise<void> {
    if (operation.kind === "upsert-preference") {
      return;
    }

    const entry = await this.database.entries.get(operation.entityId);
    if (entry === undefined || entry.userId !== this.dependencies.userId) {
      throw new Error(`Diary entry not found: ${operation.entityId}`);
    }
    await this.database.entries.update(entry.id, { syncState });
  }

  private notifyMutation(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch {
        // A subscriber cannot invalidate a mutation that has already committed.
      }
    }
  }
}

export const createDiaryRepository = (
  database: VisualDiaryDb,
  dependencies: DiaryRepositoryDependencies,
): DiaryRepository => new DiaryRepository(database, dependencies);
