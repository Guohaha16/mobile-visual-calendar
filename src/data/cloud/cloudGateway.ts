import type { DiaryEntry, StoredPreference } from "../../domain/types";

export type CloudPullResult = {
  entries: DiaryEntry[];
  preferences?: StoredPreference;
  cursor: string;
};

export interface CloudGateway {
  ensureSession(): Promise<{ userId: string }>;
  /**
   * Push delivery is at-least-once. Implementations MUST use operationId as
   * an idempotency key so repeats of the same operation have one remote effect.
   */
  pushCreate(entryId: string, operationId: string): Promise<void>;
  pushDelete(
    entryId: string,
    deletedAt: string,
    operationId: string,
  ): Promise<void>;
  // Optional gateways leave preference operations queued as a local-only pause.
  pushPreference?(
    preference: StoredPreference,
    operationId: string,
  ): Promise<void>;
  pullSince(cursor?: string): Promise<CloudPullResult>;
}
