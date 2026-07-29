import { describe, expect, it } from "vitest";

import { parseRoute, serializeRoute } from "./routes";

describe("application routes", () => {
  it("parses the shelf route", () => {
    expect(parseRoute("/")).toEqual({ view: "shelf" });
  });

  it("round-trips a calendar route", () => {
    const route = { view: "calendar", year: 2026, month: 7 } as const;

    expect(parseRoute("/calendar/2026/07")).toEqual(route);
    expect(serializeRoute(route)).toBe("/calendar/2026/07");
  });

  it("falls back to the shelf for unsupported paths", () => {
    expect(parseRoute("/unknown")).toEqual({ view: "shelf" });
    expect(parseRoute("/calendar/2026/13")).toEqual({ view: "shelf" });
  });
});
