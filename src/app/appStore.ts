import { create } from "zustand";

import type { AppRoute } from "./routes";
import { parseRoute, serializeRoute } from "./routes";

export interface AppState {
  route: AppRoute;
  selectedYear: number;
  selectedMonth: number;
  diaryDate?: string;
  isDiaryOpen: boolean;
  isBackgroundPickerOpen: boolean;
  navigate: (route: AppRoute) => void;
  restoreRoute: (route: AppRoute) => void;
  setSelectedYear: (year: number) => void;
  setSelectedMonth: (month: number) => void;
  openDiary: (date: string) => void;
  closeDiary: () => void;
  setBackgroundPickerOpen: (open: boolean) => void;
}

const currentPath =
  typeof window === "undefined" ? "/" : window.location.pathname;
const initialRoute = parseRoute(currentPath);
const now = new Date();

const routeSelection = (
  route: AppRoute,
): Pick<AppState, "route" | "selectedMonth" | "selectedYear"> =>
  route.view === "calendar"
    ? {
        route,
        selectedMonth: route.month,
        selectedYear: route.year,
      }
    : {
        route,
        selectedMonth: now.getMonth() + 1,
        selectedYear: now.getFullYear(),
      };

export const useAppStore = create<AppState>((set) => ({
  ...routeSelection(initialRoute),
  isDiaryOpen: false,
  isBackgroundPickerOpen: false,
  navigate: (route) => {
    const path = serializeRoute(route);
    if (typeof window !== "undefined" && window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    set((state) =>
      route.view === "calendar"
        ? routeSelection(route)
        : {
            route,
            selectedMonth: state.selectedMonth,
            selectedYear: state.selectedYear,
          },
    );
  },
  restoreRoute: (route) => {
    set((state) =>
      route.view === "calendar"
        ? routeSelection(route)
        : {
            route,
            selectedMonth: state.selectedMonth,
            selectedYear: state.selectedYear,
          },
    );
  },
  setSelectedYear: (selectedYear) => {
    set({ selectedYear });
  },
  setSelectedMonth: (selectedMonth) => {
    set({ selectedMonth });
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
