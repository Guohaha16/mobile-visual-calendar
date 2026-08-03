export interface EditorialBookTreatment {
  calendarBookAsset: string;
  ink: string;
  paper: string;
}

export const EDITORIAL_BOOK_TREATMENTS = [
  { paper: "#E88AB1", ink: "#181716", calendarBookAsset: "/assets/month-books/3.webp" },
  { paper: "#37623F", ink: "#F7F6F2", calendarBookAsset: "/assets/month-books/9.webp" },
  { paper: "#EA632F", ink: "#181716", calendarBookAsset: "/assets/month-books/8.webp" },
  { paper: "#2A2928", ink: "#F7F6F2", calendarBookAsset: "/assets/month-books/11.webp" },
  { paper: "#ED8CB5", ink: "#181716", calendarBookAsset: "/assets/month-books/10.webp" },
  { paper: "#B96886", ink: "#181716", calendarBookAsset: "/assets/month-books/3.webp" },
  { paper: "#1F3048", ink: "#F7F6F2", calendarBookAsset: "/assets/month-books/2.webp" },
  { paper: "#E34B4A", ink: "#F7F6F2", calendarBookAsset: "/assets/month-books/1.webp" },
  { paper: "#2F579E", ink: "#F7F6F2", calendarBookAsset: "/assets/month-books/12.webp" },
  { paper: "#DDE1DF", ink: "#181716", calendarBookAsset: "/assets/month-books/6.webp" },
  { paper: "#3A1814", ink: "#F7F6F2", calendarBookAsset: "/assets/month-books/5.webp" },
  { paper: "#DFA93A", ink: "#181716", calendarBookAsset: "/assets/month-books/4.webp" },
] as const satisfies readonly EditorialBookTreatment[];

export function getEditorialBookTreatment(
  month: number,
): EditorialBookTreatment {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError("Month must be an integer from 1 through 12");
  }

  const treatment = EDITORIAL_BOOK_TREATMENTS[month - 1];
  if (treatment === undefined) {
    throw new RangeError("Month treatment is unavailable");
  }

  return treatment;
}
