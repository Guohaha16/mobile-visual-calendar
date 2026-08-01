import type { MonthGridCell } from "../../domain/date";
import type { DiaryEntry, MediaAsset } from "../../domain/types";
import styles from "./DayCell.module.css";

interface DayCellProps {
  cell: MonthGridCell;
  entries: readonly DiaryEntry[];
  imageUrls: ReadonlyMap<string, string>;
  onOpen: (dateKey: string) => void;
}

const compareNewestFirst = (left: DiaryEntry, right: DiaryEntry): number =>
  right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);

const firstRenderableImage = (
  entries: readonly DiaryEntry[],
  imageUrls: ReadonlyMap<string, string>,
): MediaAsset | undefined => {
  for (const entry of [...entries].sort(compareNewestFirst)) {
    const image = [...entry.media]
      .filter((asset) => asset.mimeType.startsWith("image/") && imageUrls.has(asset.id))
      .sort((left, right) => left.sortOrder - right.sortOrder)[0];

    if (image !== undefined) {
      return image;
    }
  }

  return undefined;
};

const newestText = (entries: readonly DiaryEntry[]): string | undefined =>
  [...entries]
    .sort(compareNewestFirst)
    .map((entry) => entry.text.trim())
    .find((text) => text.length > 0);

export function DayCell({ cell, entries, imageUrls, onOpen }: DayCellProps) {
  if (!cell.inMonth) {
    return (
      <div
        aria-hidden="true"
        className={`${styles.cell} ${styles.outside}`}
        data-calendar-cell
        data-testid={`calendar-cell-${cell.dateKey}`}
      />
    );
  }

  const image = firstRenderableImage(entries, imageUrls);
  const imageUrl = image === undefined ? undefined : imageUrls.get(image.id);
  const text = imageUrl === undefined ? newestText(entries) : undefined;
  const hasContent = imageUrl !== undefined || text !== undefined;

  return (
    <button
      aria-label={`Open day ${cell.dateKey}`}
      className={styles.cell}
      data-calendar-cell
      data-has-content={hasContent}
      onClick={() => {
        onOpen(cell.dateKey);
      }}
      type="button"
    >
      {imageUrl === undefined ? null : (
        <img alt="" className={styles.image} src={imageUrl} />
      )}
      {text === undefined ? null : <span className={styles.excerpt}>{text}</span>}
      <span className={styles.day}>{cell.day}</span>
    </button>
  );
}
