import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BottomNav } from "./BottomNav";

describe("BottomNav", () => {
  it("exposes the three primary mobile actions", () => {
    render(
      <BottomNav
        activeView="shelf"
        onAdd={vi.fn()}
        onCalendar={vi.fn()}
        onShelf={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Bookshelf" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Bookshelf" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("button", { name: "Add diary entry" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Add diary entry" }),
    ).not.toHaveAttribute("aria-pressed");
    expect(screen.getByRole("button", { name: "Calendar" })).toBeVisible();
  });

  it("invokes the matching action", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(
      <BottomNav
        activeView="calendar"
        onAdd={onAdd}
        onCalendar={vi.fn()}
        onShelf={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Add diary entry" }),
    );
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
