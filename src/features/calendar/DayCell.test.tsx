import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { MonthGridCell } from "../../domain/date";
import type { DiaryEntry, MediaAsset } from "../../domain/types";
import { DayCell } from "./DayCell";

const cell: MonthGridCell = {
  dateKey: "2026-07-29",
  day: 29,
  month: 7,
  year: 2026,
  inMonth: true,
};

const createImage = (id: string, entryId: string, sortOrder = 0): MediaAsset => ({
  id,
  entryId,
  userId: "demo-user",
  mimeType: "image/jpeg",
  sortOrder,
  createdAt: "2026-07-29T08:00:00.000Z",
});

const createEntry = (
  id: string,
  createdAt: string,
  text: string,
  media: MediaAsset[] = [],
): DiaryEntry => ({
  id,
  userId: "demo-user",
  entryDate: cell.dateKey,
  text,
  createdAt,
  updatedAt: createdAt,
  media,
  syncState: "local",
});

describe("DayCell", () => {
  it("uses the first image from the newest entry as the day preview", () => {
    const oldEntry = createEntry(
      "old-entry",
      "2026-07-29T08:00:00.000Z",
      "old",
      [createImage("old-image", "old-entry")],
    );
    const newEntry = createEntry(
      "new-entry",
      "2026-07-29T18:00:00.000Z",
      "new",
      [
        createImage("new-image", "new-entry", 0),
        createImage("second-image", "new-entry", 1),
      ],
    );

    render(
      <DayCell
        cell={cell}
        entries={[oldEntry, newEntry]}
        imageUrls={new Map([
          ["old-image", "blob:old-image"],
          ["new-image", "blob:new-image"],
          ["second-image", "blob:second-image"],
        ])}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByRole("presentation")).toHaveAttribute(
      "src",
      "blob:new-image",
    );
    expect(screen.queryByText("+2")).not.toBeInTheDocument();
  });

  it("falls back to a text excerpt and opens the bound date", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();

    render(
      <DayCell
        cell={cell}
        entries={[
          createEntry(
            "text-entry",
            "2026-07-29T18:00:00.000Z",
            "傍晚的风很轻，沿着河边慢慢走回家。",
          ),
        ]}
        imageUrls={new Map()}
        onOpen={onOpen}
      />,
    );

    expect(screen.getByText("傍晚的风很轻，沿着河边慢慢走回家。"))
      .toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open day 2026-07-29" }));
    expect(onOpen).toHaveBeenCalledWith("2026-07-29");
  });

  it("keeps dates outside the month non-actionable", () => {
    render(
      <DayCell
        cell={{ ...cell, dateKey: "2026-06-28", day: 28, inMonth: false, month: 6 }}
        entries={[]}
        imageUrls={new Map()}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByTestId("calendar-cell-2026-06-28")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
