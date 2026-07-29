export interface MonthGridCell {
  dateKey: string;
  day: number;
  month: number;
  year: number;
  inMonth: boolean;
}

const padTwoDigits = (value: number): string => String(value).padStart(2, "0");

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
  if (!Number.isInteger(year)) {
    throw new RangeError("Year must be an integer");
  }
};

const createLocalDate = (year: number, monthIndex: number, day: number): Date => {
  const date = new Date(0);
  date.setHours(12, 0, 0, 0);
  date.setFullYear(year, monthIndex, day);
  return date;
};

export const toLocalDateKey = (date: Date): string => {
  assertValidDate(date);

  return [
    date.getFullYear(),
    padTwoDigits(date.getMonth() + 1),
    padTwoDigits(date.getDate()),
  ].join("-");
};

export const buildMonthGrid = (
  year: number,
  month: number,
): MonthGridCell[] => {
  assertValidYear(year);
  assertValidMonth(month);

  const monthIndex = month - 1;
  const firstDay = createLocalDate(year, monthIndex, 1);
  const gridStartDay = 1 - firstDay.getDay();

  return Array.from({ length: 42 }, (_, index) => {
    const date = createLocalDate(year, monthIndex, gridStartDay + index);

    return {
      dateKey: toLocalDateKey(date),
      day: date.getDate(),
      month: date.getMonth() + 1,
      year: date.getFullYear(),
      inMonth:
        date.getFullYear() === year && date.getMonth() === monthIndex,
    };
  });
};
