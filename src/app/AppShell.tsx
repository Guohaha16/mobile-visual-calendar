import { useEffect } from "react";

import { toLocalDateKey } from "../domain/date";
import { BottomNav } from "../components/BottomNav";
import { SyncStatus } from "../components/SyncStatus";
import { useAppStore } from "./appStore";
import { parseRoute } from "./routes";
import styles from "./AppShell.module.css";

export function AppShell() {
  const {
    navigate,
    openDiary,
    route,
    selectedYear,
  } = useAppStore();

  useEffect(() => {
    const handlePopState = () => {
      useAppStore.setState({ route: parseRoute(window.location.pathname) });
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const openCurrentMonth = () => {
    const now = new Date();
    navigate({
      view: "calendar",
      year: selectedYear,
      month: now.getMonth() + 1,
    });
  };

  return (
    <div className={styles.shell}>
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
        onCalendar={openCurrentMonth}
        onShelf={() => {
          navigate({ view: "shelf" });
        }}
      />
    </div>
  );
}
