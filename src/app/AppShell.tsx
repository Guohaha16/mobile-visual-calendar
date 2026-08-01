import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useLiveQuery } from "dexie-react-hooks";
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
import { createThumbnail } from "../features/diary/media";
import type { DiaryRepository } from "../data/local/diaryRepository";
import type { SyncService, SyncStatus as SyncState } from "../data/sync/syncService";
import { applicationRepository } from "./appServices";
import styles from "./AppShell.module.css";

interface AppShellProps {
  repository?: DiaryRepository;
  syncService?: SyncService;
}

const subscribeToNothing = () => () => {};
const pausedSnapshot = (): SyncState => "paused";

export function AppShell({
  repository = applicationRepository,
  syncService,
}: AppShellProps) {
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
    useDiaryBackgrounds(repository);
  const outbox = useLiveQuery(() => repository.listOutbox(), [repository], []);
  const serviceStatus = useSyncExternalStore(
    syncService === undefined
      ? subscribeToNothing
      : (listener) => syncService.subscribe(listener),
    syncService === undefined
      ? pausedSnapshot
      : () => syncService.getSnapshot(),
    pausedSnapshot,
  );
  const queuedStatus = outbox.some((operation) => operation.state === "failed")
    ? "failed"
    : outbox.some((operation) => operation.state === "syncing")
      ? "syncing"
      : outbox.length > 0
        ? "waiting"
        : "paused";
  const syncStatus =
    serviceStatus === "paused" && outbox.length > 0
      ? queuedStatus
      : serviceStatus;

  useEffect(() => {
    syncService?.start();
    return () => {
      syncService?.stop();
    };
  }, [syncService]);

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
            repository={repository}
            year={selectedYear}
          />
        ) : (
          <MonthCalendarPage
            month={route.month}
            onOpenDay={openDiary}
            repository={repository}
            year={route.year}
          />
        )}
      </main>
      <SyncStatus
        onRetry={
          syncService === undefined
            ? undefined
            : () => syncService.requestFlush()
        }
        status={syncStatus}
      />
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
                    onDelete={async (entryId) => {
                      await repository.deleteEntry(entryId, new Date().toISOString());
                      void syncService?.requestFlush();
                    }}
                    onSend={async ({ files, text }) => {
                      const media = [];
                      for (const file of files) {
                        const prepared = await createThumbnail(file);
                        media.push({
                          height: prepared.height,
                          localBlob: file,
                          mimeType: file.type,
                          thumbnailBlob: prepared.thumbnailBlob,
                          width: prepared.width,
                        });
                      }
                      await repository.createEntry({
                        entryDate: diaryDate,
                        media,
                        text,
                      });
                      void syncService?.requestFlush();
                    }}
                    repository={repository}
                  />
                ) : null}
              </AnimatePresence>
            </div>,
            document.body,
          )}
    </div>
  );
}
