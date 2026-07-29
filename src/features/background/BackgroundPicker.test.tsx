import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DiaryBackgroundAsset } from "./types";
import { BackgroundPicker } from "./BackgroundPicker";

const assets: DiaryBackgroundAsset[] = [
  {
    id: "asset-1",
    entryId: "entry-1",
    userId: "user-1",
    entryDate: "2026-07-29",
    mimeType: "image/png",
    sortOrder: 0,
    createdAt: "2026-07-29T09:00:00.000Z",
    url: "blob:asset-1",
  },
];

describe("BackgroundPicker", () => {
  it("selects only images already attached to diary entries", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <BackgroundPicker
        assets={assets}
        onRandom={vi.fn()}
        onSelect={onSelect}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Use diary image from 2026-07-29",
      }),
    );
    expect(onSelect).toHaveBeenCalledWith("asset-1");
    expect(screen.queryByRole("button", { name: /upload/i })).not.toBeInTheDocument();
    expect(document.querySelector("input[type='file']")).toBeNull();
  });

  it("offers random mode", async () => {
    const user = userEvent.setup();
    const onRandom = vi.fn();

    render(
      <BackgroundPicker
        assets={assets}
        onRandom={onRandom}
        onSelect={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Random background" }),
    );
    expect(onRandom).toHaveBeenCalledTimes(1);
  });
});
