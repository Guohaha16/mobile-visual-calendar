import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { DiaryBackgroundAsset } from "./types";
import { BackgroundScene } from "./BackgroundScene";

const asset: DiaryBackgroundAsset = {
  id: "asset-1",
  entryId: "entry-1",
  userId: "user-1",
  entryDate: "2026-07-29",
  mimeType: "image/jpeg",
  sortOrder: 0,
  createdAt: "2026-07-29T10:00:00.000Z",
  url: "blob:diary-background",
  luminance: "dark",
};

describe("BackgroundScene", () => {
  it("uses a light paper fallback without diary images", () => {
    render(
      <BackgroundScene assets={[]} preference={{ mode: "random" }} />,
    );

    expect(screen.getByTestId("background-scene"))
      .toHaveClass("fallback");
    expect(screen.getByTestId("background-scene")).toHaveAttribute(
      "data-surface",
      "paper",
    );
  });

  it("exposes the cool editorial fallback for the bookshelf", () => {
    render(
      <BackgroundScene
        assets={[]}
        preference={{ mode: "random" }}
        surface="editorial"
      />,
    );

    expect(screen.getByTestId("background-scene")).toHaveAttribute(
      "data-surface",
      "editorial",
    );
  });

  it("uses the solid exhibition background by default", () => {
    render(
      <BackgroundScene assets={[asset]} preference={{ mode: "solid" }} />,
    );

    expect(screen.getByTestId("background-scene")).toHaveClass("fallback");
    expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
  });

  it("renders the resolved diary image without a scrim on the calendar", () => {
    render(
      <BackgroundScene
        assets={[asset]}
        preference={{ mode: "pinned", pinnedAssetId: asset.id }}
      />,
    );

    expect(screen.getByTestId("background-scene")).toHaveAttribute(
      "data-luminance",
      "dark",
    );
    expect(screen.getByRole("presentation")).toHaveAttribute(
      "src",
      asset.url,
    );
    expect(document.querySelector("[class*='scrim']")).not.toBeInTheDocument();
  });

  it("keeps the readability scrim on the editorial bookshelf", () => {
    const { container } = render(
      <BackgroundScene
        assets={[asset]}
        preference={{ mode: "pinned", pinnedAssetId: asset.id }}
        surface="editorial"
      />,
    );

    expect(container.querySelector("[class*='scrim']")).toBeInTheDocument();
  });

  it("returns to paper when a diary image fails to load", () => {
    render(
      <BackgroundScene
        assets={[asset]}
        preference={{ mode: "pinned", pinnedAssetId: asset.id }}
      />,
    );

    fireEvent.error(screen.getByRole("presentation"));
    expect(screen.getByTestId("background-scene")).toHaveClass("fallback");
  });
});
