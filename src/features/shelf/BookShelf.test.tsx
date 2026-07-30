import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BookShelf } from "./BookShelf";

describe("BookShelf", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows only the current month as a front cover", () => {
    render(
      <BookShelf
        covers={new Map()}
        onOpenMonth={vi.fn()}
        today={new Date(2026, 6, 30)}
        year={2026}
      />,
    );

    expect(
      screen.getAllByRole("button", { name: /Open .* 2026/ }),
    ).toHaveLength(12);
    expect(
      screen.getByRole("button", { name: "Open July 2026" }),
    ).toHaveAttribute("data-mode", "cover");
    expect(
      screen.getByRole("button", { name: "Open June 2026" }),
    ).toHaveAttribute("data-mode", "spine");
    expect(
      screen.getByRole("button", { name: "Open August 2026" }),
    ).toHaveAttribute("data-mode", "spine");
  });

  it("keeps non-current image books on their spines", () => {
    render(
      <BookShelf
        covers={new Map([
          [7, { id: "july-cover", url: "blob:july-cover" }],
          [8, { id: "august-cover", url: "blob:august-cover" }],
        ])}
        onOpenMonth={vi.fn()}
        today={new Date(2026, 6, 30)}
        year={2026}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Open July 2026" }),
    ).toHaveAttribute("data-mode", "cover");
    expect(
      screen.getByRole("button", { name: "Open August 2026" }),
    ).toHaveAttribute("data-mode", "spine");
  });

  it("keeps every month on its spine when browsing another year", () => {
    render(
      <BookShelf
        covers={new Map()}
        onOpenMonth={vi.fn()}
        today={new Date(2026, 6, 30)}
        year={2025}
      />,
    );

    for (const button of screen.getAllByRole("button", {
      name: /Open .* 2025/,
    })) {
      expect(button).toHaveAttribute("data-mode", "spine");
    }
  });

  it("focuses a book before opening its month", async () => {
    vi.useFakeTimers();
    const onOpenMonth = vi.fn();

    render(
      <BookShelf covers={new Map()} onOpenMonth={onOpenMonth} year={2026} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open March 2026" }));
    expect(
      screen.getByRole("button", { name: "Open March 2026" }),
    ).toHaveAttribute("data-focused", "true");
    expect(onOpenMonth).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(280);
    });
    expect(onOpenMonth).toHaveBeenCalledWith(3);
  });

  it("does not treat horizontal shelf drag as year navigation", async () => {
    const onOpenMonth = vi.fn();
    const user = userEvent.setup();

    render(
      <BookShelf covers={new Map()} onOpenMonth={onOpenMonth} year={2026} />,
    );

    const shelf = screen.getByRole("group", {
      name: "2026 month bookshelf",
    });
    fireEvent.pointerDown(shelf, { clientX: 300 });
    fireEvent.pointerMove(shelf, { clientX: 80 });
    fireEvent.pointerUp(shelf, { clientX: 80 });
    await user.keyboard("{ArrowLeft}{ArrowRight}");

    expect(onOpenMonth).not.toHaveBeenCalled();
  });
});
