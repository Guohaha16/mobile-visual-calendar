/// <reference types="node" />

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd, env, execPath } from "node:process";
import {
  ModuleKind,
  ScriptTarget,
  transpileModule,
} from "typescript";
import { describe, expect, it } from "vitest";
import type { MonthGridCell } from "./date";
import { buildMonthGrid, toLocalDateKey } from "./date";

const compiledDateModule = transpileModule(
  readFileSync(resolve(cwd(), "src/domain/date.ts"), "utf8"),
  {
    compilerOptions: {
      module: ModuleKind.ESNext,
      target: ScriptTarget.ES2022,
    },
  },
).outputText;

const evaluateDateModule = <Result>(
  timezone: string,
  expression: string,
): Result => {
  const output = execFileSync(
    execPath,
    [
      "--input-type=module",
      "--eval",
      `${compiledDateModule}\nprocess.stdout.write(JSON.stringify(${expression}));`,
    ],
    {
      encoding: "utf8",
      env: { ...env, TZ: timezone },
    },
  );

  return JSON.parse(output) as Result;
};

describe("toLocalDateKey", () => {
  it("formats the local calendar date without UTC truncation", () => {
    expect(toLocalDateKey(new Date(2026, 6, 29, 23, 30))).toBe("2026-07-29");
  });

  it("uses the local date on both sides of UTC midnight", () => {
    expect(
      evaluateDateModule<string>(
        "Pacific/Kiritimati",
        'toLocalDateKey(new Date("2026-07-29T10:30:00.000Z"))',
      ),
    ).toBe("2026-07-30");
    expect(
      evaluateDateModule<string>(
        "Etc/GMT+12",
        'toLocalDateKey(new Date("2026-07-30T11:30:00.000Z"))',
      ),
    ).toBe("2026-07-29");
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

  it("preserves skipped civil dates independently of the process timezone", () => {
    const grid = evaluateDateModule<MonthGridCell[]>(
      "Pacific/Apia",
      "buildMonthGrid(2011, 12)",
    );
    const keys = grid.map((cell) => cell.dateKey);

    expect(grid).toHaveLength(42);
    expect(new Set(keys)).toHaveLength(42);
    expect(keys.filter((key) => key === "2011-12-30")).toHaveLength(1);
  });

  it("rejects months outside the 1 through 12 range", () => {
    expect(() => buildMonthGrid(2026, 0)).toThrow(RangeError);
    expect(() => buildMonthGrid(2026, 13)).toThrow(RangeError);
  });

  it("supports years 1000 through 9999", () => {
    expect(() => buildMonthGrid(1000, 1)).not.toThrow();
    expect(() => buildMonthGrid(9999, 12)).not.toThrow();
    expect(() => buildMonthGrid(999, 12)).toThrow(RangeError);
    expect(() => buildMonthGrid(10000, 1)).toThrow(RangeError);
  });

  it("keeps spillover date keys zero-padded at the year boundary", () => {
    const previousYearKeys = buildMonthGrid(1000, 1)
      .filter((cell) => cell.year === 999)
      .map((cell) => cell.dateKey);

    expect(previousYearKeys.length).toBeGreaterThan(0);
    expect(previousYearKeys.every((key) => key.startsWith("0999-"))).toBe(true);
  });
});
