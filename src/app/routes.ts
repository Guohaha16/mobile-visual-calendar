export type ShelfRoute = {
  view: "shelf";
};

export type CalendarRoute = {
  view: "calendar";
  year: number;
  month: number;
};

export type AppRoute = ShelfRoute | CalendarRoute;

const CALENDAR_ROUTE = /^\/calendar\/(\d{4})\/(\d{2})\/?$/;

export function parseRoute(pathname: string): AppRoute {
  if (pathname === "" || pathname === "/") {
    return { view: "shelf" };
  }

  const match = CALENDAR_ROUTE.exec(pathname);
  if (match === null) {
    return { view: "shelf" };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1000 || year > 9999 || month < 1 || month > 12) {
    return { view: "shelf" };
  }

  return { view: "calendar", year, month };
}

export function serializeRoute(route: AppRoute): string {
  if (route.view === "shelf") {
    return "/";
  }

  return `/calendar/${route.year}/${String(route.month).padStart(2, "0")}`;
}
