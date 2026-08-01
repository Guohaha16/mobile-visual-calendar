import { useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import type { DiaryRepository } from "../../data/local/diaryRepository";
import { createMediaObjectUrl } from "../diary/media";
import { CalendarPaper } from "./CalendarPaper";
import styles from "./MonthCalendarPage.module.css";

interface MonthCalendarPageProps {
  month: number;
  onOpenDay: (dateKey: string) => void;
  repository: DiaryRepository;
  year: number;
}

const monthKey = (year: number, month: number): string =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-`;

export function MonthCalendarPage({
  month,
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
        blob === undefined
      ) {
        continue;
      }

      const url = createMediaObjectUrl(blob);
      if (url === undefined) {
        continue;
      }
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

  return (
    <section aria-label={`${year}-${String(month).padStart(2, "0")} calendar`} className={styles.page}>
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
