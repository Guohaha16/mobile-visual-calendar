import { useEffect, useMemo } from "react";
import { Trash2 } from "lucide-react";

import { FrostedIconButton } from "../../components/FrostedIconButton";
import type { DiaryEntry } from "../../domain/types";
import { createMediaObjectUrl } from "./media";
import styles from "./DiaryTimeline.module.css";

interface DiaryTimelineProps {
  entries: readonly DiaryEntry[];
  onDelete?: (entryId: string) => Promise<void> | void;
}

const compareChronologically = (left: DiaryEntry, right: DiaryEntry): number =>
  left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);

const formatTime = (timestamp: string): string =>
  new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
  }).format(new Date(timestamp));

export function DiaryTimeline({ entries, onDelete }: DiaryTimelineProps) {
  const orderedEntries = useMemo(
    () => [...entries].sort(compareChronologically),
    [entries],
  );
  const { mediaUrls, urls } = useMemo(() => {
    const nextMediaUrls = new Map<string, string>();
    const nextUrls: string[] = [];

    for (const asset of orderedEntries.flatMap((entry) => entry.media)) {
      const blob = asset.thumbnailBlob ?? asset.localBlob;
      if (
        !asset.mimeType.startsWith("image/") ||
        blob === undefined
      ) {
        continue;
      }

      const url = createMediaObjectUrl(blob);
      if (url === undefined) {
        continue;
      }
      nextMediaUrls.set(asset.id, url);
      nextUrls.push(url);
    }

    return { mediaUrls: nextMediaUrls, urls: nextUrls };
  }, [orderedEntries]);

  useEffect(
    () => () => {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
    },
    [urls],
  );

  if (orderedEntries.length === 0) {
    return <p className={styles.empty}>No entries for this day</p>;
  }

  return (
    <div aria-label="Diary history" className={styles.timeline} role="feed">
      {orderedEntries.map((entry) => {
        const images = entry.media
          .filter((asset) => mediaUrls.has(asset.id))
          .sort((left, right) => left.sortOrder - right.sortOrder);
        const time = formatTime(entry.createdAt);

        return (
          <article
            aria-label={`Diary entry at ${time}`}
            className={styles.record}
            data-testid="diary-record"
            key={entry.id}
          >
            {images.length === 0 ? null : (
              <div className={styles.media}>
                {images.map((asset, index) => (
                  <img
                    alt={`Diary image ${index + 1} from ${entry.entryDate}`}
                    className={styles.image}
                    key={asset.id}
                    src={mediaUrls.get(asset.id)}
                  />
                ))}
              </div>
            )}
            {entry.text.trim().length === 0 ? null : (
              <p className={styles.text}>{entry.text}</p>
            )}
            <footer className={styles.footer}>
              {onDelete === undefined ? null : (
                <FrostedIconButton
                  className={styles.delete}
                  icon={Trash2}
                  label={`Delete entry at ${time}`}
                  onClick={() => {
                    void onDelete(entry.id);
                  }}
                />
              )}
              <time className={styles.time} dateTime={entry.createdAt}>
                {time}
              </time>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
