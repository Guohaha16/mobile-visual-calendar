import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CalendarPaper } from "./CalendarPaper";

describe("CalendarPaper", () => {
  it("renders the supplied paper asset and a stable six-week grid", () => {
    const { container } = render(
      <CalendarPaper
        entries={[]}
        imageUrls={new Map()}
        month={7}
        onOpenDay={vi.fn()}
        year={2026}
      />,
    );

    expect(screen.getByRole("img", { name: "Calendar paper" })).toHaveAttribute(
      "src",
      "/assets/calendar-paper-template.png",
    );
    expect(container.querySelectorAll("[data-calendar-cell]")).toHaveLength(42);
    expect(
      screen.getAllByRole("button", { name: /Open day 2026-07-/ }),
    ).toHaveLength(31);
  });

  it("labels the month and all seven weekday columns", () => {
    render(
      <CalendarPaper
        entries={[]}
        imageUrls={new Map()}
        month={7}
        onOpenDay={vi.fn()}
        year={2026}
      />,
    );

    expect(screen.getByRole("heading", { name: "July 2026" })).toBeInTheDocument();
    for (const weekday of ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]) {
      expect(screen.getByText(weekday)).toBeInTheDocument();
    }
  });
});
