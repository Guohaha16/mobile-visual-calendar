import { Blob as NodeBlob } from "node:buffer";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createVisualDiaryDb, type VisualDiaryDb } from "../../data/local/db";
import {
  createDiaryRepository,
  type DiaryRepository,
} from "../../data/local/diaryRepository";
import { useDiaryBackgrounds } from "./useDiaryBackgrounds";

const TEST_USER_ID = "00000000-0000-4000-8000-000000000029";

function BackgroundHarness({
  repository,
  surface = "calendar:2026-07",
}: {
  repository: DiaryRepository;
  surface?: `calendar:${string}`;
}) {
  const { assets, preference, setPreference } =
    useDiaryBackgrounds(repository, surface, async () => "dark");

  return (
    <>
      <output aria-label="Background state">
        {preference.mode}:{assets[0]?.entryDate ?? "empty"}:
        {assets[0]?.luminance ?? "unknown"}
      </output>
      <button
        onClick={() => {
          const asset = assets[0];
          if (asset !== undefined) {
            void setPreference({
              mode: "pinned",
              pinnedAssetId: asset.id,
            });
          }
        }}
        type="button"
      >
        Pin first
      </button>
    </>
  );
}

describe("useDiaryBackgrounds", () => {
  let database: VisualDiaryDb;
  let repository: DiaryRepository;
  let idCounter = 0;

  beforeEach(() => {
    database = createVisualDiaryDb(
      `background-hook-${crypto.randomUUID()}`,
      TEST_USER_ID,
    );
    repository = createDiaryRepository(database, {
      clock: () => "2026-07-29T09:30:00.000Z",
      generateId: () => `background-${++idCounter}`,
      userId: TEST_USER_ID,
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:background-hook"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it("loads diary images and queues a pinned preference", async () => {
    await repository.createEntry({
      entryDate: "2026-07-29",
      text: "",
      media: [
        {
          localBlob: new NodeBlob(["image"], {
            type: "image/png",
          }) as unknown as Blob,
          mimeType: "image/png",
        },
      ],
    });

    const user = userEvent.setup();
    render(<BackgroundHarness repository={repository} />);

    expect(
      await screen.findByText("solid:2026-07-29:dark"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pin first" }));

    await waitFor(async () => {
      expect(
        await repository.getBackgroundPreference("calendar:2026-07"),
      ).toMatchObject({ mode: "pinned" });
    });
    expect(await repository.listOutbox()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "upsert-preference" }),
      ]),
    );
  });

  it("does not carry one month's selected background into another month", async () => {
    await repository.setBackgroundPreference("calendar:2026-07", {
      mode: "random",
    });

    const { rerender } = render(
      <BackgroundHarness repository={repository} surface="calendar:2026-07" />,
    );
    expect(await screen.findByText(/^random:/)).toBeInTheDocument();

    rerender(
      <BackgroundHarness repository={repository} surface="calendar:2026-08" />,
    );
    expect(await screen.findByText(/^solid:/)).toBeInTheDocument();
  });
});
