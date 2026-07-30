import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion } from "motion/react";

import { MonthBook, type MonthBookMode, type MonthCover } from "./MonthBook";
import styles from "./BookShelf.module.css";

interface BookShelfProps {
  covers: ReadonlyMap<number, MonthCover>;
  onOpenMonth: (month: number) => void;
  year: number;
}

const months = Array.from({ length: 12 }, (_, index) => index + 1);

const getMonthBookMode = (
  year: number,
  month: number,
): MonthBookMode => ((year + month) % 4 === 1 ? "spine" : "cover");

export function BookShelf({ covers, onOpenMonth, year }: BookShelfProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const openTimerRef = useRef<number | undefined>(undefined);
  const draggingRef = useRef(false);
  const pointerStartRef = useRef<number | undefined>(undefined);
  const [focusedMonth, setFocusedMonth] = useState<number>();
  const [leftConstraint, setLeftConstraint] = useState(0);
  const x = useMotionValue(0);
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (viewport === null || track === null) {
      return;
    }

    const measure = () => {
      const overflow = Math.max(0, track.scrollWidth - viewport.clientWidth);
      setLeftConstraint(-overflow);

      const now = new Date();
      const initialMonth = year === now.getFullYear() ? now.getMonth() + 1 : 1;
      const target = track.querySelector<HTMLElement>(
        `[data-shelf-month="${initialMonth}"]`,
      );
      if (target !== null) {
        const centered =
          viewport.clientWidth / 2 - target.offsetLeft - target.offsetWidth / 2;
        const nextX = Math.max(-overflow, Math.min(0, centered));
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => {
            x.set(nextX);
          });
        } else {
          x.set(nextX);
        }
      } else {
        x.set(0);
      }
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => {
        window.removeEventListener("resize", measure);
      };
    }

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(track);
    return () => {
      observer.disconnect();
    };
  }, [x, year]);

  useEffect(
    () => () => {
      if (openTimerRef.current !== undefined) {
        window.clearTimeout(openTimerRef.current);
      }
    },
    [],
  );

  const openFocusedMonth = (month: number) => {
    if (draggingRef.current) {
      return;
    }

    setFocusedMonth(month);
    if (openTimerRef.current !== undefined) {
      window.clearTimeout(openTimerRef.current);
    }
    openTimerRef.current = window.setTimeout(
      () => {
        onOpenMonth(month);
      },
      reducedMotion ? 0 : 260,
    );
  };

  const endDrag = () => {
    window.setTimeout(() => {
      draggingRef.current = false;
    }, 0);
  };

  return (
    <div className={styles.stage}>
      <div
        className={styles.viewport}
        onPointerDown={(event) => {
          pointerStartRef.current = event.clientX;
        }}
        onPointerMove={(event) => {
          if (
            pointerStartRef.current !== undefined &&
            Math.abs(event.clientX - pointerStartRef.current) > 7
          ) {
            draggingRef.current = true;
          }
        }}
        onPointerUp={() => {
          pointerStartRef.current = undefined;
          endDrag();
        }}
        ref={viewportRef}
      >
        <motion.div
          aria-label={`${year} month bookshelf`}
          className={styles.track}
          drag="x"
          dragConstraints={{ left: leftConstraint, right: 0 }}
          dragElastic={reducedMotion ? 0 : 0.08}
          dragMomentum={!reducedMotion}
          onDragStart={() => {
            draggingRef.current = true;
            setFocusedMonth(undefined);
          }}
          onDragEnd={endDrag}
          ref={trackRef}
          role="group"
          style={{ x }}
        >
          {months.map((month) => (
            <MonthBook
              cover={covers.get(month)}
              focused={focusedMonth === month}
              key={month}
              mode={
                covers.has(month) ? "cover" : getMonthBookMode(year, month)
              }
              month={month}
              onSelect={openFocusedMonth}
              shelfX={x}
              year={year}
            />
          ))}
        </motion.div>
      </div>
      <div aria-hidden="true" className={styles.plank} />
      <div aria-hidden="true" className={styles.shadow} />
    </div>
  );
}
