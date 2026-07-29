import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { AppShell } from "./AppShell";
import { useAppStore } from "./appStore";

describe("AppShell", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
    useAppStore.setState({
      diaryDate: undefined,
      isBackgroundPickerOpen: false,
      isDiaryOpen: false,
      route: { view: "shelf" },
    });
  });

  it("keeps one navigation and a stateful sheet portal host", async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    expect(screen.getAllByRole("navigation", { name: "Primary" })).toHaveLength(
      1,
    );
    const sheetLayer = screen.getByTestId("sheet-layer");
    expect(sheetLayer).toHaveAttribute("data-diary-open", "false");

    await user.click(
      screen.getByRole("button", { name: "Add diary entry" }),
    );
    expect(sheetLayer).toHaveAttribute("data-diary-open", "true");
  });
});
