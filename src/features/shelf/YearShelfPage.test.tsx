import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DiaryRepository } from "../../data/local/diaryRepository";
import { YearShelfPage } from "./YearShelfPage";

const createRepository = () =>
  ({
    listEntriesForYear: vi.fn().mockResolvedValue([]),
    subscribeToMutations: vi.fn(() => vi.fn()),
  }) as unknown as DiaryRepository;

describe("YearShelfPage", () => {
  it("switches years only through the explicit year controls", async () => {
    const onYearChange = vi.fn();
    const user = userEvent.setup();

    render(
      <YearShelfPage
        onOpenMonth={vi.fn()}
        onYearChange={onYearChange}
        repository={createRepository()}
        year={2026}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Previous year" }));
    await user.click(screen.getByRole("button", { name: "Next year" }));

    expect(onYearChange).toHaveBeenNthCalledWith(1, 2025);
    expect(onYearChange).toHaveBeenNthCalledWith(2, 2027);

    fireEvent.pointerDown(
      screen.getByRole("group", { name: "2026 month bookshelf" }),
      { clientX: 280 },
    );
    fireEvent.pointerMove(
      screen.getByRole("group", { name: "2026 month bookshelf" }),
      { clientX: 70 },
    );
    fireEvent.pointerUp(
      screen.getByRole("group", { name: "2026 month bookshelf" }),
      { clientX: 70 },
    );

    expect(onYearChange).toHaveBeenCalledTimes(2);
  });
});
