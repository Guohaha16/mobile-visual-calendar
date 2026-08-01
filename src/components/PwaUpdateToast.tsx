import { RefreshCw, X } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

import styles from "./PwaUpdateToast.module.css";

export function PwaUpdateToast() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) {
    return null;
  }

  return (
    <aside aria-label="Application update" className={styles.toast}>
      <button
        className={styles.update}
        onClick={() => {
          void updateServiceWorker(true);
        }}
        type="button"
      >
        <RefreshCw aria-hidden="true" size={17} strokeWidth={1.9} />
        <span>Update available</span>
      </button>
      <button
        aria-label="Dismiss update"
        className={styles.dismiss}
        onClick={() => {
          setNeedRefresh(false);
        }}
        title="Dismiss update"
        type="button"
      >
        <X aria-hidden="true" size={17} strokeWidth={1.9} />
      </button>
    </aside>
  );
}
