import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MonthBook } from "./MonthBook";

describe("MonthBook", () => {
  it("renders a diary image as the month cover", () => {
    render(
      <MonthBook
        cover={{ id: "cover-1", url: "blob:cover-1" }}
        focused={false}
        mode="cover"
        month={7}
        onSelect={vi.fn()}
        year={2026}
      />,
    );

    expect(screen.getByRole("img", { name: "July diary cover" })).toHaveAttribute(
      "src",
      "blob:cover-1",
    );
  });

  it("exposes the month as a semantic button", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <MonthBook
        focused={false}
        mode="spine"
        month={7}
        onSelect={onSelect}
        year={2026}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open July 2026" }));
    expect(onSelect).toHaveBeenCalledWith(7);
  });

  it("applies the contrast-safe editorial treatment for July", () => {
    render(
      <MonthBook
        focused={false}
        mode="spine"
        month={7}
        onSelect={vi.fn()}
        year={2026}
      />,
    );

    const slot = screen.getByRole("button", {
      name: "Open July 2026",
    }).parentElement;
    expect(slot).toHaveStyle({
      "--book-ink": "#F7F6F2",
      "--book-paper": "#1F3048",
    });
  });
});
