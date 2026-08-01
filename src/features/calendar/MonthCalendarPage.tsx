import { useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { FrostedIconButton } from "../../components/FrostedIconButton";
import type { DiaryRepository } from "../../data/local/diaryRepository";
import { CalendarPaper } from "./CalendarPaper";
import styles from "./MonthCalendarPage.module.css";

interface MonthCalendarPageProps {
  month: number;
  onNavigateMonth: (year: number, month: number) => void;
  onOpenDay: (dateKey: string) => void;
  repository: DiaryRepository;
  year: number;
}

const previousMonth = (year: number, month: number): [number, number] =>
  month === 1 ? [year - 1, 12] : [year, month - 1];

const nextMonth = (year: number, month: number): [number, number] =>
  month === 12 ? [year + 1, 1] : [year, month + 1];

const monthKey = (year: number, month: number): string =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-`;

export function MonthCalendarPage({
  month,
  onNavigateMonth,
  onOpenDay,
  repository,
  year,
}: MonthCalendarPageProps) {
  const yearEntries = useLiveQuery(
    () => repository.listEntriesForYear(year),
    [repository, year],
    [],
  );
  const entries = useMemo(() => {
    const prefix = monthKey(year, month);
    return yearEntries.filter((entry) => entry.entryDate.startsWith(prefix));
  }, [month, year, yearEntries]);
  const { imageUrls, urls } = useMemo(() => {
    const nextImageUrls = new Map<string, string>();
    const nextUrls: string[] = [];

    for (const asset of entries.flatMap((entry) => entry.media)) {
      const blob = asset.thumbnailBlob ?? asset.localBlob;
      if (
        !asset.mimeType.startsWith("image/") ||
        blob === undefined ||
        typeof URL.createObjectURL !== "function"
      ) {
        continue;
      }

      const url = URL.createObjectURL(blob);
      nextImageUrls.set(asset.id, url);
      nextUrls.push(url);
    }

    return { imageUrls: nextImageUrls, urls: nextUrls };
  }, [entries]);

  useEffect(
    () => () => {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
    },
    [urls],
  );

  const [previousYear, previousMonthNumber] = previousMonth(year, month);
  const [nextYear, nextMonthNumber] = nextMonth(year, month);

  return (
    <section aria-label={`${year}-${String(month).padStart(2, "0")} calendar`} className={styles.page}>
      <header className={styles.controls}>
        <FrostedIconButton
          disabled={previousYear < 1000}
          icon={ChevronLeft}
          label="Previous month"
          onClick={() => {
            onNavigateMonth(previousYear, previousMonthNumber);
          }}
        />
        <span aria-hidden="true" className={styles.rule} />
        <FrostedIconButton
          disabled={nextYear > 9999}
          icon={ChevronRight}
          label="Next month"
          onClick={() => {
            onNavigateMonth(nextYear, nextMonthNumber);
          }}
        />
      </header>
      <CalendarPaper
        entries={entries}
        imageUrls={imageUrls}
        month={month}
        onOpenDay={onOpenDay}
        year={year}
      />
    </section>
  );
}
