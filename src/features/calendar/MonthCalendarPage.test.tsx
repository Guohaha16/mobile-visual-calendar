import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DiaryRepository } from "../../data/local/diaryRepository";
import { MonthCalendarPage } from "./MonthCalendarPage";

const createRepository = () =>
  ({
    listEntriesForYear: vi.fn().mockResolvedValue([]),
    subscribeToMutations: vi.fn(() => vi.fn()),
  }) as unknown as DiaryRepository;

describe("MonthCalendarPage", () => {
  it("keeps the selected month fixed without month-switch controls", () => {
    render(
      <MonthCalendarPage
        month={1}
        onOpenDay={vi.fn()}
        repository={createRepository()}
        year={2026}
      />,
    );

    expect(screen.queryByRole("button", { name: "Previous month" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next month" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "January 2026" })).toBeInTheDocument();
  });

  it("opens the selected calendar date", async () => {
    const onOpenDay = vi.fn();
    const user = userEvent.setup();

    render(
      <MonthCalendarPage
        month={7}
        onOpenDay={onOpenDay}
        repository={createRepository()}
        year={2026}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Open day 2026-07-29" }));
    expect(onOpenDay).toHaveBeenCalledWith("2026-07-29");
  });

  it("loads diary records for the displayed year", async () => {
    const repository = createRepository();

    render(
      <MonthCalendarPage
        month={7}
        onOpenDay={vi.fn()}
        repository={repository}
        year={2026}
      />,
    );

    await waitFor(() => {
      expect(repository.listEntriesForYear).toHaveBeenCalledWith(2026);
    });
  });
});
