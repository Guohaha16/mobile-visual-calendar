import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DiaryEntry } from "../../domain/types";
import { DiaryTimeline } from "./DiaryTimeline";

const entry = (id: string, createdAt: string, text: string): DiaryEntry => ({
  id,
  userId: "demo-user",
  entryDate: "2026-07-29",
  text,
  createdAt,
  updatedAt: createdAt,
  media: [],
  syncState: "local",
});

describe("DiaryTimeline", () => {
  it("renders diary records chronologically in near-full-width blocks", () => {
    render(
      <DiaryTimeline
        entries={[
          entry("late", "2026-07-29T18:40:00.000Z", "Evening"),
          entry("early", "2026-07-29T07:10:00.000Z", "Morning"),
          entry("middle", "2026-07-29T12:20:00.000Z", "Noon"),
        ]}
      />,
    );

    const records = screen.getAllByTestId("diary-record");
    expect(records.map((record) => record.textContent)).toEqual([
      expect.stringContaining("Morning"),
      expect.stringContaining("Noon"),
      expect.stringContaining("Evening"),
    ]);
    for (const record of records) {
      expect(record.className).toMatch(/record/);
    }
  });

  it("shows a quiet empty state", () => {
    render(<DiaryTimeline entries={[]} />);
    expect(screen.getByText("No entries for this day")).toBeInTheDocument();
  });
});
