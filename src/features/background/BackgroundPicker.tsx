import { Shuffle, X } from "lucide-react";

import { FrostedIconButton } from "../../components/FrostedIconButton";
import type { DiaryBackgroundAsset } from "./types";
import styles from "./BackgroundPicker.module.css";

interface BackgroundPickerProps {
  assets: readonly DiaryBackgroundAsset[];
  onClose?: () => void;
  onRandom: () => void;
  onSelect: (assetId: string) => void;
}

export function BackgroundPicker({
  assets,
  onClose,
  onRandom,
  onSelect,
}: BackgroundPickerProps) {
  return (
    <section aria-label="Background" className={styles.picker}>
      <header className={styles.header}>
        <h2 className={styles.title}>Background</h2>
        <div className={styles.commands}>
          <button
            aria-label="Random background"
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
      <div className={styles.grid}>
        {assets.map((asset) => (
          <button
            aria-label={`Use diary image from ${asset.entryDate}`}
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
