import { Shuffle, X } from "lucide-react";

import { FrostedIconButton } from "../../components/FrostedIconButton";
import type { BackgroundPreference } from "../../domain/types";
import type { DiaryBackgroundAsset } from "./types";
import styles from "./BackgroundPicker.module.css";

interface BackgroundPickerProps {
  assets: readonly DiaryBackgroundAsset[];
  onClose?: () => void;
  onRandom: () => void;
  onSelect: (assetId: string) => void;
  onSolid: () => void;
  preference: BackgroundPreference;
}

export function BackgroundPicker({
  assets,
  onClose,
  onRandom,
  onSelect,
  onSolid,
  preference,
}: BackgroundPickerProps) {
  return (
    <section aria-label="Background" className={styles.picker}>
      <header className={styles.header}>
        <h2 className={styles.title}>Background</h2>
        <div className={styles.commands}>
          <button
            aria-label="Random background"
            aria-pressed={preference.mode === "random"}
            className={styles.random}
            onClick={onRandom}
            type="button"
          >
            <Shuffle aria-hidden="true" size={18} />
            <span>Random</span>
          </button>
          {onClose === undefined ? null : (
            <FrostedIconButton
              icon={X}
              label="Close background picker"
              onClick={onClose}
            />
          )}
        </div>
      </header>
      <div
        aria-label="Diary background images"
        className={styles.grid}
        role="region"
      >
        <button
          aria-label="Use exhibition white background"
          aria-pressed={preference.mode === "solid"}
          className={`${styles.asset} ${styles.solid}`}
          onClick={onSolid}
          type="button"
        >
          <span aria-hidden="true" className={styles.solidSwatch} />
          <span className={styles.solidLabel}>Exhibition white</span>
        </button>
        {assets.map((asset) => (
          <button
            aria-label={`Use diary image from ${asset.entryDate}`}
            aria-pressed={
              preference.mode === "pinned" &&
              preference.pinnedAssetId === asset.id
            }
            className={styles.asset}
            key={asset.id}
            onClick={() => {
              onSelect(asset.id);
            }}
            type="button"
          >
            <img
              alt=""
              loading="lazy"
              src={asset.thumbnailUrl ?? asset.url}
            />
            <span aria-hidden="true" className={styles.date}>
              {asset.entryDate}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
