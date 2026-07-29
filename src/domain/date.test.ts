import { describe, expect, it } from "vitest";
import { buildMonthGrid, toLocalDateKey } from "./date";

describe("toLocalDateKey", () => {
  it("formats the local calendar date without UTC truncation", () => {
    expect(toLocalDateKey(new Date(2026, 6, 29, 23, 30))).toBe("2026-07-29");
  });
});

describe("buildMonthGrid", () => {
  it("builds a Sunday-first 42-cell grid for July 2026", () => {
    const grid = buildMonthGrid(2026, 7);

    expect(grid).toHaveLength(42);
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(31);
    expect(grid[0]).toEqual({
      dateKey: "2026-06-28",
      day: 28,
      month: 6,
      year: 2026,
      inMonth: false,
    });
    expect(grid[3]).toMatchObject({
      dateKey: "2026-07-01",
      day: 1,
      month: 7,
      year: 2026,
      inMonth: true,
    });
    expect(grid[41]).toEqual({
      dateKey: "2026-08-08",
      day: 8,
      month: 8,
      year: 2026,
      inMonth: false,
    });
  });

  it("keeps date keys in ascending local-date order across month boundaries", () => {
    const keys = buildMonthGrid(2026, 7).map((cell) => cell.dateKey);

    expect(keys).toEqual([...keys].sort());
  });

  it("rejects months outside the 1 through 12 range", () => {
    expect(() => buildMonthGrid(2026, 0)).toThrow(RangeError);
    expect(() => buildMonthGrid(2026, 13)).toThrow(RangeError);
  });
});
