import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DiaryRepository } from "../../data/local/diaryRepository";
import type { DiaryEntry } from "../../domain/types";
import { DiarySheet } from "./DiarySheet";

const entry = (id: string, date: string, text: string): DiaryEntry => ({
  id,
  userId: "demo-user",
  entryDate: date,
  text,
  createdAt: `${date}T09:42:00.000Z`,
  updatedAt: `${date}T09:42:00.000Z`,
  media: [],
  syncState: "local",
});

const entriesByDate = new Map([
  ["2026-07-29", [entry("entry-29", "2026-07-29", "River walk")]],
  ["2026-07-30", [entry("entry-30", "2026-07-30", "Museum afternoon")]],
]);

const createRepository = () =>
  ({
    listEntriesForDate: vi.fn(async (date: string) => entriesByDate.get(date) ?? []),
  }) as unknown as DiaryRepository;

function DateSwitchHarness({ repository }: { repository: DiaryRepository }) {
  const [date, setDate] = useState("2026-07-29");
  return (
    <DiarySheet
      date={date}
      onClose={vi.fn()}
      onDateChange={setDate}
      repository={repository}
    />
  );
}

describe("DiarySheet", () => {
  it("switches the bound date and history without closing", async () => {
    const repository = createRepository();
    render(<DateSwitchHarness repository={repository} />);

    expect(
      screen.getByRole("dialog", { name: "Diary for 2026-07-29" }),
    ).toHaveFocus();
    expect(screen.getByLabelText("Diary date")).not.toHaveFocus();
    expect(await screen.findByText("River walk")).toBeInTheDocument();

    const dateInput = screen.getByLabelText("Diary date");
    fireEvent.change(dateInput, { target: { value: "2026-07-30" } });

    expect(
      screen.getByRole("dialog", { name: "Diary for 2026-07-30" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Museum afternoon")).toBeInTheDocument();
    await waitFor(() => {
      expect(repository.listEntriesForDate).toHaveBeenCalledWith("2026-07-30");
    });
  });

  it("closes on Escape and restores focus", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const { unmount } = render(
      <DiarySheet
        date="2026-07-29"
        onClose={onClose}
        onDateChange={vi.fn()}
        repository={createRepository()}
      />,
    );

    expect(document.body).toHaveStyle({ overflow: "hidden" });
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.body.style.overflow).toBe("");
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
