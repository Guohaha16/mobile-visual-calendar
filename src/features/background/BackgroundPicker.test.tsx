import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { DiaryBackgroundAsset } from "./types";
import { BackgroundPicker } from "./BackgroundPicker";

const asset: DiaryBackgroundAsset = {
  createdAt: "2026-07-29T10:00:00.000Z",
  entryDate: "2026-07-29",
  entryId: "entry-1",
  id: "asset-1",
  luminance: "light",
  mimeType: "image/jpeg",
  sortOrder: 0,
  url: "blob:diary-background",
  userId: "user-1",
};

describe("BackgroundPicker", () => {
  it("offers exhibition white as the selected default background", async () => {
    const user = userEvent.setup();
    const onSolid = vi.fn();
    render(
      <BackgroundPicker
        assets={[asset]}
        onRandom={vi.fn()}
        onSelect={vi.fn()}
        onSolid={onSolid}
        preference={{ mode: "solid" }}
      />,
    );

    const solid = screen.getByRole("button", {
      name: "Use exhibition white background",
    });
    expect(solid).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Random background" }))
      .toHaveAttribute("aria-pressed", "false");

    await user.click(solid);
    expect(onSolid).toHaveBeenCalledOnce();
  });
});
