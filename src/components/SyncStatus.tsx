import { RefreshCw } from "lucide-react";

import type { SyncStatus as SyncState } from "../data/sync/syncService";
import styles from "./SyncStatus.module.css";

interface SyncStatusProps {
  onRetry?: () => Promise<void> | void;
  status: SyncState;
}

const statusLabels: Partial<Record<SyncState, string>> = {
  failed: "Sync failed",
  syncing: "Syncing",
  waiting: "Waiting to sync",
};

export function SyncStatus({ onRetry, status }: SyncStatusProps) {
  const label = statusLabels[status];
  if (label === undefined) {
    return null;
  }

  return (
    <output aria-live="polite" className={styles.status} data-state={status}>
      {status === "failed" && onRetry !== undefined ? (
        <button
          aria-label="Retry sync"
          className={styles.retry}
          onClick={() => {
            void onRetry();
          }}
          title="Retry sync"
          type="button"
        >
          <RefreshCw aria-hidden="true" size={14} strokeWidth={1.9} />
        </button>
      ) : null}
      <span>{label}</span>
    </output>
  );
}
