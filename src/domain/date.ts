export interface MonthGridCell {
  dateKey: string;
  day: number;
  month: number;
  year: number;
  inMonth: boolean;
}

const padTwoDigits = (value: number): string => String(value).padStart(2, "0");

const formatDateKey = (year: number, month: number, day: number): string =>
  [
    String(year).padStart(4, "0"),
    padTwoDigits(month),
    padTwoDigits(day),
  ].join("-");

const MIN_SUPPORTED_YEAR = 1000;
const MAX_SUPPORTED_YEAR = 9999;

const assertValidDate = (date: Date): void => {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Date must be valid");
  }
};

const assertValidMonth = (month: number): void => {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError("Month must be an integer from 1 through 12");
  }
};

const assertValidYear = (year: number): void => {
  if (
    !Number.isInteger(year) ||
    year < MIN_SUPPORTED_YEAR ||
    year > MAX_SUPPORTED_YEAR
  ) {
    throw new RangeError(
      `Year must be an integer from ${MIN_SUPPORTED_YEAR} through ${MAX_SUPPORTED_YEAR}`,
    );
  }
};

export const toLocalDateKey = (date: Date): string => {
  assertValidDate(date);

  return formatDateKey(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
  );
};

export const buildMonthGrid = (
  year: number,
  month: number,
): MonthGridCell[] => {
  assertValidYear(year);
  assertValidMonth(month);

  const monthIndex = month - 1;
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const gridStartDay = 1 - firstDay.getUTCDay();

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, monthIndex, gridStartDay + index));
    const cellYear = date.getUTCFullYear();
    const cellMonth = date.getUTCMonth() + 1;
    const cellDay = date.getUTCDate();

    return {
      dateKey: formatDateKey(cellYear, cellMonth, cellDay),
      day: cellDay,
      month: cellMonth,
      year: cellYear,
      inMonth: cellYear === year && cellMonth === month,
    };
  });
};
