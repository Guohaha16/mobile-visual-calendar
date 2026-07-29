import { create } from "zustand";

import type { AppRoute } from "./routes";
import { parseRoute, serializeRoute } from "./routes";

export interface AppState {
  route: AppRoute;
  selectedYear: number;
  diaryDate?: string;
  isDiaryOpen: boolean;
  isBackgroundPickerOpen: boolean;
  navigate: (route: AppRoute) => void;
  setSelectedYear: (year: number) => void;
  openDiary: (date: string) => void;
  closeDiary: () => void;
  setBackgroundPickerOpen: (open: boolean) => void;
}

const currentPath =
  typeof window === "undefined" ? "/" : window.location.pathname;

export const useAppStore = create<AppState>((set) => ({
  route: parseRoute(currentPath),
  selectedYear: new Date().getFullYear(),
  isDiaryOpen: false,
  isBackgroundPickerOpen: false,
  navigate: (route) => {
    const path = serializeRoute(route);
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    set({ route });
  },
  setSelectedYear: (selectedYear) => {
    set({ selectedYear });
  },
  openDiary: (diaryDate) => {
    set({ diaryDate, isDiaryOpen: true });
  },
  closeDiary: () => {
    set({ isDiaryOpen: false });
  },
  setBackgroundPickerOpen: (isBackgroundPickerOpen) => {
    set({ isBackgroundPickerOpen });
  },
}));
