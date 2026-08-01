import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SyncStatus } from "./SyncStatus";

describe("SyncStatus", () => {
  it.each(["idle", "paused"] as const)("stays hidden while %s", (status) => {
    const { container } = render(<SyncStatus status={status} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows queued local work without competing with the diary", () => {
    render(<SyncStatus status="waiting" />);
    expect(screen.getByText("Waiting to sync")).toBeInTheDocument();
  });

  it("offers an explicit retry after failure", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<SyncStatus onRetry={onRetry} status="failed" />);

    expect(screen.getByText("Sync failed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry sync" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
