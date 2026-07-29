import type { SyncStatus as SyncState } from "../data/sync/syncService";

interface SyncStatusProps {
  status: SyncState;
}

const statusLabels: Partial<Record<SyncState, string>> = {
  failed: "Sync failed",
  syncing: "Syncing",
  waiting: "Waiting to sync",
};

export function SyncStatus({ status }: SyncStatusProps) {
  const label = statusLabels[status];
  if (label === undefined) {
    return null;
  }

  return (
    <output aria-live="polite" className="visually-hidden">
      {label}
    </output>
  );
}
