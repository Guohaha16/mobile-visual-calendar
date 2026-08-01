import { useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { FrostedIconButton } from "../../components/FrostedIconButton";
import type { DiaryRepository } from "../../data/local/diaryRepository";
import { DiaryTimeline } from "./DiaryTimeline";
import styles from "./DiarySheet.module.css";

interface DiarySheetProps {
  date: string;
  onClose: () => void;
  onDateChange: (date: string) => void;
  repository: DiaryRepository;
}

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function DiarySheet({
  date,
  onClose,
  onDateChange,
  repository,
}: DiarySheetProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const reduceMotion = useReducedMotion();
  const entries = useLiveQuery(
    () => repository.listEntriesForDate(date),
    [repository, date],
    [],
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dateInputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || dialogRef.current === null) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const duration = reduceMotion ? 0 : 0.26;

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className={styles.backdrop}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
      transition={{ duration }}
    >
      <motion.section
        animate={{ opacity: 1, y: 0 }}
        aria-label={`Diary for ${date}`}
        aria-modal="true"
        className={styles.sheet}
        exit={{ opacity: 0, y: "100%" }}
        initial={{ opacity: 0, y: "100%" }}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
      >
        <div aria-hidden="true" className={styles.handle} />
        <header className={styles.header}>
          <label className={styles.dateField}>
            <CalendarDays aria-hidden="true" size={19} strokeWidth={1.8} />
            <input
              aria-label="Diary date"
              className={styles.dateInput}
              onChange={(event) => {
                if (event.target.value.length > 0) {
                  onDateChange(event.target.value);
                }
              }}
              ref={dateInputRef}
              type="date"
              value={date}
            />
          </label>
          <FrostedIconButton icon={X} label="Close diary" onClick={onClose} />
        </header>
        <div className={styles.history}>
          <DiaryTimeline entries={entries} />
        </div>
      </motion.section>
    </motion.div>
  );
}
