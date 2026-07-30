import { describe, expect, it } from "vitest";

import {
  EDITORIAL_BOOK_TREATMENTS,
  getEditorialBookTreatment,
} from "./editorialPalette";

describe("editorial book palette", () => {
  it("assigns twelve distinct, stable month treatments", () => {
    expect(EDITORIAL_BOOK_TREATMENTS).toHaveLength(12);
    expect(
      new Set(EDITORIAL_BOOK_TREATMENTS.map(({ paper }) => paper)).size,
    ).toBe(12);
  });

  it("uses anchor navy with light ink for July", () => {
    expect(getEditorialBookTreatment(7)).toEqual({
      ink: "#F7F6F2",
      paper: "#1F3048",
    });
  });

  it("rejects invalid months", () => {
    expect(() => getEditorialBookTreatment(0)).toThrow(RangeError);
    expect(() => getEditorialBookTreatment(13)).toThrow(RangeError);
  });
});
