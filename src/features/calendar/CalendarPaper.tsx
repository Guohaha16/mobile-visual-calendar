import { buildMonthGrid } from "../../domain/date";
import type { DiaryEntry } from "../../domain/types";
import { DayCell } from "./DayCell";
import styles from "./CalendarPaper.module.css";

interface CalendarPaperProps {
  entries: readonly DiaryEntry[];
  imageUrls: ReadonlyMap<string, string>;
  month: number;
  onOpenDay: (dateKey: string) => void;
  year: number;
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function CalendarPaper({
  entries,
  imageUrls,
  month,
  onOpenDay,
  year,
}: CalendarPaperProps) {
  const entriesByDate = new Map<string, DiaryEntry[]>();
  for (const entry of entries) {
    const dayEntries = entriesByDate.get(entry.entryDate) ?? [];
    dayEntries.push(entry);
    entriesByDate.set(entry.entryDate, dayEntries);
  }

  return (
    <section
      aria-label={`${MONTHS[month - 1]} ${year} paper calendar`}
      className={styles.paper}
    >
      <img
        alt="Calendar paper"
        className={styles.template}
        draggable={false}
        src="/assets/calendar-paper-template.png"
      />
      <div className={styles.content}>
        <h1 className={styles.month}>{MONTHS[month - 1]} <span>{year}</span></h1>
        <div aria-hidden="true" className={styles.weekdays}>
          {WEEKDAYS.map((weekday) => (
            <span key={weekday}>{weekday}</span>
          ))}
        </div>
        <div className={styles.grid}>
          {buildMonthGrid(year, month).map((cell) => (
            <DayCell
              cell={cell}
              entries={entriesByDate.get(cell.dateKey) ?? []}
              imageUrls={imageUrls}
              key={cell.dateKey}
              onOpen={onOpenDay}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
