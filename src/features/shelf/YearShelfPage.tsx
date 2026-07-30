import { useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { DiaryRepository } from "../../data/local/diaryRepository";
import { selectMonthCover } from "../../domain/shelf";
import type { DiaryEntry } from "../../domain/types";
import { FrostedIconButton } from "../../components/FrostedIconButton";
import { BookShelf } from "./BookShelf";
import type { MonthCover } from "./MonthBook";
import styles from "./YearShelfPage.module.css";

interface YearShelfPageProps {
  onOpenMonth: (month: number) => void;
  onYearChange: (year: number) => void;
  repository: DiaryRepository;
  year: number;
}

const monthFromEntry = (entry: DiaryEntry): number =>
  Number(entry.entryDate.slice(5, 7));

export function YearShelfPage({
  onOpenMonth,
  onYearChange,
  repository,
  year,
}: YearShelfPageProps) {
  const entries = useLiveQuery(
    () => repository.listEntriesForYear(year),
    [repository, year],
    [],
  );

  const { covers, urls } = useMemo(() => {
    const nextCovers = new Map<number, MonthCover>();
    const nextUrls: string[] = [];

    for (let month = 1; month <= 12; month += 1) {
      const monthEntries = entries.filter(
        (entry) => monthFromEntry(entry) === month,
      );
      const coverId = selectMonthCover(monthEntries);
      if (coverId === undefined) {
        continue;
      }

      const asset = monthEntries
        .flatMap((entry) => entry.media)
        .find((media) => media.id === coverId);
      const blob = asset?.thumbnailBlob ?? asset?.localBlob;
      if (
        asset === undefined ||
        blob === undefined ||
        typeof URL.createObjectURL !== "function"
      ) {
        continue;
      }

      const url = URL.createObjectURL(blob);
      nextUrls.push(url);
      nextCovers.set(month, { id: asset.id, url });
    }

    return { covers: nextCovers, urls: nextUrls };
  }, [entries]);

  useEffect(
    () => () => {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
    },
    [urls],
  );

  return (
    <section aria-label={`${year} bookshelf`} className={styles.page}>
      <header className={styles.header}>
        <FrostedIconButton
          disabled={year <= 1000}
          icon={ChevronLeft}
          label="Previous year"
          onClick={() => {
            onYearChange(year - 1);
          }}
        />
        <div className={styles.heading}>
          <p className={styles.kicker}>Visual diary</p>
          <h1 className={styles.year}>{year}</h1>
        </div>
        <FrostedIconButton
          disabled={year >= 9999}
          icon={ChevronRight}
          label="Next year"
          onClick={() => {
            onYearChange(year + 1);
          }}
        />
      </header>
      <div className={styles.shelfArea}>
        <BookShelf
          covers={covers}
          key={year}
          onOpenMonth={onOpenMonth}
          year={year}
        />
      </div>
      <p aria-live="polite" className={styles.monthCount}>
        Twelve months, {entries.length} {entries.length === 1 ? "memory" : "memories"}
      </p>
    </section>
  );
}
