import { useEffect } from "react";
import { createPortal } from "react-dom";

import { toLocalDateKey } from "../domain/date";
import { BottomNav } from "../components/BottomNav";
import { SyncStatus } from "../components/SyncStatus";
import { useAppStore } from "./appStore";
import { parseRoute } from "./routes";
import { BackgroundScene } from "../features/background/BackgroundScene";
import styles from "./AppShell.module.css";

export function AppShell() {
  const {
    isBackgroundPickerOpen,
    isDiaryOpen,
    navigate,
    openDiary,
    restoreRoute,
    route,
    selectedMonth,
    selectedYear,
  } = useAppStore();

  useEffect(() => {
    const handlePopState = () => {
      restoreRoute(parseRoute(window.location.pathname));
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [restoreRoute]);

  const openSelectedMonth = () => {
    if (route.view === "calendar") {
      return;
    }

    navigate({
      view: "calendar",
      year: selectedYear,
      month: selectedMonth,
    });
  };

  return (
    <div className={styles.shell}>
      <BackgroundScene assets={[]} preference={{ mode: "random" }} />
      <main aria-label="Visual diary" className={styles.main}>
        {route.view === "shelf" ? (
          <section aria-label={`${selectedYear} bookshelf`} className={styles.view}>
            <h1 className={styles.year}>{selectedYear}</h1>
          </section>
        ) : (
          <section
            aria-label={`${route.year}-${String(route.month).padStart(2, "0")} calendar`}
            className={styles.view}
          >
            <h1 className={styles.year}>
              {route.year}.{String(route.month).padStart(2, "0")}
            </h1>
            <div aria-hidden="true" className={styles.calendarHint} />
          </section>
        )}
      </main>
      <SyncStatus status="paused" />
      <BottomNav
        activeView={route.view}
        onAdd={() => {
          openDiary(toLocalDateKey(new Date()));
        }}
        onCalendar={openSelectedMonth}
        onShelf={() => {
          navigate({ view: "shelf" });
        }}
      />
      {typeof document === "undefined"
        ? null
        : createPortal(
            <div
              className={styles.sheetLayer}
              data-background-open={isBackgroundPickerOpen}
              data-diary-open={isDiaryOpen}
              data-testid="sheet-layer"
            />,
            document.body,
          )}
    </div>
  );
}
