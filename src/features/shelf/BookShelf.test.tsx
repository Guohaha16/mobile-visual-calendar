import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BookShelf } from "./BookShelf";

describe("BookShelf", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders all twelve months with deterministic display modes", () => {
    render(<BookShelf covers={new Map()} onOpenMonth={vi.fn()} year={2026} />);

    expect(
      screen.getAllByRole("button", { name: /Open .* 2026/ }),
    ).toHaveLength(12);
    expect(
      screen.getByRole("button", { name: "Open July 2026" }),
    ).toHaveAttribute("data-mode", "spine");
  });

  it("prioritizes a diary image over the empty-book spine treatment", () => {
    render(
      <BookShelf
        covers={new Map([[7, { id: "july-cover", url: "blob:july-cover" }]])}
        onOpenMonth={vi.fn()}
        year={2026}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Open July 2026" }),
    ).toHaveAttribute("data-mode", "cover");
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
