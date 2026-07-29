import type { DiaryEntry } from "./types";

export interface BookGeometry {
  width: number;
  height: number;
  tilt: number;
  depth: number;
  offset: number;
}

const MIN_SUPPORTED_YEAR = 1000;
const MAX_SUPPORTED_YEAR = 9999;

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

const mix = (value: number): number => {
  let mixed = value >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0aaad);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a2d97);
  return (mixed ^ (mixed >>> 15)) >>> 0;
};

const boundedValue = (
  seed: number,
  salt: number,
  minimum: number,
  maximum: number,
): number => minimum + (mix(seed + salt) % (maximum - minimum + 1));

export const createBookGeometry = (
  year: number,
  month: number,
): BookGeometry => {
  assertValidYear(year);
  assertValidMonth(month);

  const seed = mix(Math.imul(year, 12) + month);

  return {
    width: boundedValue(seed, 1, 72, 104),
    height: boundedValue(seed, 2, 104, 148),
    tilt: boundedValue(seed, 3, -4, 4),
    depth: boundedValue(seed, 4, 10, 24),
    offset: boundedValue(seed, 5, -6, 6),
  };
};

const compareEntriesNewestFirst = (
  left: DiaryEntry,
  right: DiaryEntry,
): number =>
  right.entryDate.localeCompare(left.entryDate) ||
  right.createdAt.localeCompare(left.createdAt) ||
  right.updatedAt.localeCompare(left.updatedAt) ||
  right.id.localeCompare(left.id);

export const selectMonthCover = (
  entries: readonly DiaryEntry[],
): string | undefined => {
  const chronologicalEntries = entries
    .filter((entry) => entry.deletedAt === undefined)
    .sort(compareEntriesNewestFirst);

  for (const entry of chronologicalEntries) {
    const image = [...entry.media]
      .filter((asset) => asset.mimeType.toLowerCase().startsWith("image/"))
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id),
      )[0];

    if (image !== undefined) {
      return image.id;
    }
  }

  return undefined;
};
