import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createVisualDiaryDb, type VisualDiaryDb } from "../data/local/db";
import { createDiaryRepository } from "../data/local/diaryRepository";
import { AppShell } from "./AppShell";
import { useAppStore } from "./appStore";

const databases: VisualDiaryDb[] = [];

const createRepository = () => {
  const database = createVisualDiaryDb(
    `diary-flow-${crypto.randomUUID()}`,
    "demo-user",
  );
  databases.push(database);
  let id = 0;

  return createDiaryRepository(database, {
    clock: () => "2026-07-29T01:42:00.000Z",
    generateId: () => `flow-${++id}`,
    userId: "demo-user",
  });
};

describe("diary flow", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/calendar/2026/07");
    useAppStore.setState({
      diaryDate: "2026-07-29",
      isBackgroundPickerOpen: false,
      isDiaryOpen: true,
      route: { view: "calendar", year: 2026, month: 7 },
      selectedMonth: 7,
      selectedYear: 2026,
    });

    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ close: vi.fn(), height: 800, width: 1200 }),
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => {
        callback(new Blob(["thumbnail"], { type: "image/webp" }));
      },
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:diary-flow");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await Promise.all(databases.splice(0).map((database) => database.delete()));
  });

  it("persists an entry without showing cloud status in local demo mode", async () => {
    const repository = createRepository();
    const user = userEvent.setup();
    render(<AppShell repository={repository} />);

    await user.type(screen.getByRole("textbox", { name: "Diary text" }), "Today");
    await user.click(screen.getByRole("button", { name: "Send diary entry" }));

    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(screen.queryByText("Waiting to sync")).not.toBeInTheDocument();
    await expect(repository.listEntriesForDate("2026-07-29")).resolves.toEqual([
      expect.objectContaining({
        entryDate: "2026-07-29",
        media: [],
        text: "Today",
      }),
    ]);

    await user.click(
      await screen.findByRole("button", { name: /Delete entry at/ }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Today")).not.toBeInTheDocument();
    });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await expect(repository.listEntriesForDate("2026-07-29")).resolves.toEqual([]);
  });
});
