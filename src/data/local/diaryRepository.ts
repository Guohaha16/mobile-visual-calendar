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

export type OutboxOperationUpdate = Partial<Omit<OutboxOperation, "id">>;

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

const compareOutbox = (
  left: OutboxOperation,
  right: OutboxOperation,
): number =>
  left.createdAt.localeCompare(right.createdAt) ||
  left.id.localeCompare(right.id);

const isDiaryImage = (asset: MediaAsset): boolean =>
  asset.mimeType.startsWith("image/");

export class DiaryRepository {
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly database: VisualDiaryDb,
    private readonly dependencies: DiaryRepositoryDependencies,
  ) {}

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
    const operation: OutboxOperation = {
      id: this.dependencies.generateId(),
      kind: "create-entry",
      entityId: entry.id,
      createdAt,
      attempts: 0,
      state: "waiting",
    };

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
        await this.database.outbox.add(operation);
      },
    );

    this.notifyMutation();
    return entry;
  }

  async deleteEntry(id: string, deletedAt: string): Promise<void> {
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
          createdAt: deletedAt,
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

    return Promise.all(visibleEntries.map((entry) => this.hydrateEntry(entry)));
  }

  async listEntriesForYear(year: number): Promise<DiaryEntry[]> {
    const prefix = `${yearKey(year)}-`;
    const entries = await this.database.entries
      .where("entryDate")
      .startsWith(prefix)
      .toArray();

    for (const entry of entries) {
      assertLocalDateKey(entry.entryDate);
    }

    const visibleEntries = entries
      .filter(
        (entry) =>
          entry.userId === this.dependencies.userId &&
          entry.deletedAt === undefined,
      )
      .sort(compareEntries);

    return Promise.all(visibleEntries.map((entry) => this.hydrateEntry(entry)));
  }

  async listYearImages(year: number): Promise<MediaAsset[]> {
    const entries = await this.listEntriesForYear(year);
    return entries.flatMap((entry) => entry.media.filter(isDiaryImage));
  }

  async listDiaryImages(): Promise<MediaAsset[]> {
    const entries = await this.database.entries.toArray();

    for (const entry of entries) {
      assertLocalDateKey(entry.entryDate);
    }

    const visibleEntries = entries
      .filter(
        (entry) =>
          entry.userId === this.dependencies.userId &&
          entry.deletedAt === undefined,
      )
      .sort(compareEntries);
    const hydratedEntries = await Promise.all(
      visibleEntries.map((entry) => this.hydrateEntry(entry)),
    );

    return hydratedEntries.flatMap((entry) =>
      entry.media.filter(isDiaryImage),
    );
  }

  async getBackgroundPreference(): Promise<
    BackgroundPreference | undefined
  > {
    return (await this.database.preferences.get("background"))?.value;
  }

  async setBackgroundPreference(
    value: BackgroundPreference,
    updatedAt = this.dependencies.clock(),
  ): Promise<StoredPreference> {
    const preference: StoredPreference = {
      key: "background",
      value,
      updatedAt,
    };
    const operation: OutboxOperation = {
      id: this.dependencies.generateId(),
      kind: "upsert-preference",
      entityId: preference.key,
      createdAt: updatedAt,
      attempts: 0,
      state: "waiting",
    };

    await this.database.transaction(
      "rw",
      this.database.preferences,
      this.database.outbox,
      async () => {
        await this.database.preferences.put(preference);
        await this.database.outbox.add(operation);
      },
    );

    this.notifyMutation();
    return preference;
  }

  async listOutbox(): Promise<OutboxOperation[]> {
    return (await this.database.outbox.toArray()).sort(compareOutbox);
  }

  async getOutboxOperation(
    id: string,
  ): Promise<OutboxOperation | undefined> {
    return this.database.outbox.get(id);
  }

  async updateOutboxOperation(
    id: string,
    update: OutboxOperationUpdate,
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
    return {
      ...entry,
      media: await this.listMediaForEntry(entry.id),
    };
  }

  private notifyMutation(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const createDiaryRepository = (
  database: VisualDiaryDb,
  dependencies: DiaryRepositoryDependencies,
): DiaryRepository => new DiaryRepository(database, dependencies);
