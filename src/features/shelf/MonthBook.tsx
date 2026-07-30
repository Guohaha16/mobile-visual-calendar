import type { CSSProperties } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";

import { createBookGeometry } from "../../domain/shelf";
import { getEditorialBookTreatment } from "./editorialPalette";
import styles from "./MonthBook.module.css";

export interface MonthCover {
  id: string;
  url: string;
}

export type MonthBookMode = "cover" | "spine";

interface MonthBookProps {
  cover?: MonthCover;
  focused: boolean;
  mode: MonthBookMode;
  month: number;
  onSelect: (month: number) => void;
  shelfX?: MotionValue<number>;
  year: number;
}

const monthNames = [
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
] as const;

type BookStyle = CSSProperties & {
  "--book-depth": string;
  "--book-height": string;
  "--book-ink": string;
  "--book-paper": string;
  "--book-slot-width": string;
};

export function MonthBook({
  cover,
  focused,
  mode,
  month,
  onSelect,
  shelfX,
  year,
}: MonthBookProps) {
  const geometry = createBookGeometry(year, month);
  const reducedMotion = useReducedMotion();
  const stationaryX = useMotionValue(0);
  const parallaxX = useTransform(
    shelfX ?? stationaryX,
    (value) => value * ((month - 6.5) / 2200),
  );
  const monthName = monthNames[month - 1] ?? "Month";
  const treatment = getEditorialBookTreatment(month);
  const closedWidth =
    mode === "spine" ? Math.max(42, Math.round(geometry.width * 0.54)) : geometry.width;
  const style: BookStyle = {
    "--book-depth": `${geometry.depth}px`,
    "--book-height": `${geometry.height}px`,
    "--book-ink": treatment.ink,
    "--book-paper": treatment.paper,
    "--book-slot-width": `${geometry.width + 16}px`,
  };

  return (
    <motion.div
      className={styles.slot}
      data-shelf-month={month}
      style={{ ...style, x: parallaxX }}
    >
      <motion.button
        animate={{
          rotate: focused || reducedMotion ? 0 : geometry.tilt,
          scale: focused && !reducedMotion ? 1.045 : 1,
          width: focused ? geometry.width : closedWidth,
          y: focused ? -14 : geometry.offset,
        }}
        aria-label={`Open ${monthName} ${year}`}
        className={styles.book}
        data-focused={focused ? "true" : "false"}
        data-has-cover={cover === undefined ? "false" : "true"}
        data-mode={mode}
        data-month={month}
        onClick={() => {
          onSelect(month);
        }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : { type: "spring", stiffness: 330, damping: 27, mass: 0.82 }
        }
        type="button"
      >
        <span aria-hidden="true" className={styles.depth} />
        {cover === undefined ? null : (
          <img
            alt={`${monthName} diary cover`}
            className={styles.cover}
            draggable={false}
            src={cover.url}
          />
        )}
        <span aria-hidden="true" className={styles.paperGrain} />
        <span className={styles.monthNumber}>{String(month).padStart(2, "0")}</span>
        <span className={styles.coverTitle}>{monthName}</span>
        <span className={styles.spineTitle}>{monthName.slice(0, 3)}</span>
        <span className={styles.bookYear}>{year}</span>
      </motion.button>
    </motion.div>
  );
}
