import type { DiaryEntry, StoredPreference } from "../../domain/types";

export type CloudPullResult = {
  entries: DiaryEntry[];
  preferences?: StoredPreference;
  cursor: string;
};

export interface CloudGateway {
  ensureSession(): Promise<{ userId: string }>;
  pushCreate(entryId: string): Promise<void>;
  pushDelete(entryId: string, deletedAt: string): Promise<void>;
  // Optional gateways leave preference operations queued as a local-only pause.
  pushPreference?(preference: StoredPreference): Promise<void>;
  pullSince(cursor?: string): Promise<CloudPullResult>;
}
