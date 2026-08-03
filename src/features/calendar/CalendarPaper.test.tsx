import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CalendarPaper } from "./CalendarPaper";

describe("CalendarPaper", () => {
  it("removes an unused trailing week from a five-week month", () => {
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
    expect(screen.getByTestId("calendar-book")).toHaveAttribute(
      "src",
      "/assets/month-books/2.webp",
    );
    expect(container.querySelectorAll("[data-calendar-cell]")).toHaveLength(35);
    expect(container.querySelector("[data-week-count]"))
      .toHaveAttribute("data-week-count", "5");
    expect(
      screen.getAllByRole("button", { name: /Open day 2026-07-/ }),
    ).toHaveLength(31);
  });

  it("keeps the sixth week when the month needs it", () => {
    const { container } = render(
      <CalendarPaper
        entries={[]}
        imageUrls={new Map()}
        month={8}
        onOpenDay={vi.fn()}
        year={2026}
      />,
    );

    expect(container.querySelectorAll("[data-calendar-cell]")).toHaveLength(42);
    expect(container.querySelector("[data-week-count]"))
      .toHaveAttribute("data-week-count", "6");
    expect(screen.getByTestId("calendar-book")).toHaveAttribute(
      "src",
      "/assets/month-books/1.webp",
    );
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
