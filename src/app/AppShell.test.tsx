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
      selectedMonth: 7,
      selectedYear: 2026,
    });
  });

  it("keeps route, year, and month synchronized across history changes", async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    expect(screen.getByTestId("background-scene")).toHaveAttribute(
      "data-surface",
      "editorial",
    );
    await user.click(screen.getByRole("button", { name: "Calendar" }));
    expect(window.location.pathname).toBe("/calendar/2026/07");
    expect(screen.getByTestId("background-scene")).toHaveAttribute(
      "data-surface",
      "paper",
    );
    expect(useAppStore.getState()).toMatchObject({
      route: { view: "calendar", year: 2026, month: 7 },
      selectedMonth: 7,
      selectedYear: 2026,
    });

    window.history.pushState({}, "", "/calendar/2030/11");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(useAppStore.getState()).toMatchObject({
      route: { view: "calendar", year: 2030, month: 11 },
      selectedMonth: 11,
      selectedYear: 2030,
    });
    expect(
      screen.getByRole("button", { name: "Calendar" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("opens the background picker in the shared portal", async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    await user.click(
      screen.getByRole("button", { name: "Choose background" }),
    );
    expect(screen.getByTestId("sheet-layer")).toHaveAttribute(
      "data-background-open",
      "true",
    );
    expect(
      screen.getByRole("region", { name: "Background" }),
    ).toBeInTheDocument();
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
