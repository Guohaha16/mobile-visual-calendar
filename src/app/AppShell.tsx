import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Image } from "lucide-react";
import { AnimatePresence } from "motion/react";

import { toLocalDateKey } from "../domain/date";
import { BottomNav } from "../components/BottomNav";
import { FrostedIconButton } from "../components/FrostedIconButton";
import { SyncStatus } from "../components/SyncStatus";
import { useAppStore } from "./appStore";
import { parseRoute } from "./routes";
import { BackgroundScene } from "../features/background/BackgroundScene";
import { BackgroundPicker } from "../features/background/BackgroundPicker";
import { useDiaryBackgrounds } from "../features/background/useDiaryBackgrounds";
import { YearShelfPage } from "../features/shelf/YearShelfPage";
import { MonthCalendarPage } from "../features/calendar/MonthCalendarPage";
import { DiarySheet } from "../features/diary/DiarySheet";
import { applicationRepository } from "./appServices";
import styles from "./AppShell.module.css";

export function AppShell() {
  const {
    isBackgroundPickerOpen,
    isDiaryOpen,
    diaryDate,
    closeDiary,
    navigate,
    openDiary,
    restoreRoute,
    route,
    selectedMonth,
    selectedYear,
    setBackgroundPickerOpen,
    setSelectedMonth,
    setSelectedYear,
  } = useAppStore();
  const { assets, preference, setPreference } =
    useDiaryBackgrounds(applicationRepository);

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
      <BackgroundScene
        assets={assets}
        preference={preference}
        surface={route.view === "shelf" ? "editorial" : "paper"}
      />
      <FrostedIconButton
        className={styles.backgroundButton}
        icon={Image}
        label="Choose background"
        onClick={() => {
          setBackgroundPickerOpen(true);
        }}
      />
      <main aria-label="Visual diary" className={styles.main}>
        {route.view === "shelf" ? (
          <YearShelfPage
            onOpenMonth={(month) => {
              setSelectedMonth(month);
              navigate({ view: "calendar", year: selectedYear, month });
            }}
            onYearChange={setSelectedYear}
            repository={applicationRepository}
            year={selectedYear}
          />
        ) : (
          <MonthCalendarPage
            month={route.month}
            onOpenDay={openDiary}
            repository={applicationRepository}
            year={route.year}
          />
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
            >
              {isBackgroundPickerOpen ? (
                <BackgroundPicker
                  assets={assets}
                  onClose={() => {
                    setBackgroundPickerOpen(false);
                  }}
                  onRandom={() => {
                    void setPreference({ mode: "random" }).then(() => {
                      setBackgroundPickerOpen(false);
                    });
                  }}
                  onSelect={(assetId) => {
                    void setPreference({
                      mode: "pinned",
                      pinnedAssetId: assetId,
                    }).then(() => {
                      setBackgroundPickerOpen(false);
                    });
                  }}
                />
              ) : null}
              <AnimatePresence>
                {isDiaryOpen && diaryDate !== undefined ? (
                  <DiarySheet
                    date={diaryDate}
                    key="diary-sheet"
                    onClose={closeDiary}
                    onDateChange={openDiary}
                    repository={applicationRepository}
                  />
                ) : null}
              </AnimatePresence>
            </div>,
            document.body,
          )}
    </div>
  );
}
