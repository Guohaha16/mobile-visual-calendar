export interface EditorialBookTreatment {
  ink: string;
  paper: string;
}

export const EDITORIAL_BOOK_TREATMENTS = [
  { paper: "#E88AB1", ink: "#181716" },
  { paper: "#37623F", ink: "#F7F6F2" },
  { paper: "#EA632F", ink: "#181716" },
  { paper: "#2A2928", ink: "#F7F6F2" },
  { paper: "#ED8CB5", ink: "#181716" },
  { paper: "#B96886", ink: "#181716" },
  { paper: "#1F3048", ink: "#F7F6F2" },
  { paper: "#E34B4A", ink: "#F7F6F2" },
  { paper: "#2F579E", ink: "#F7F6F2" },
  { paper: "#DDE1DF", ink: "#181716" },
  { paper: "#3A1814", ink: "#F7F6F2" },
  { paper: "#DFA93A", ink: "#181716" },
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
