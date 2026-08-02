import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DiaryComposer } from "./DiaryComposer";

describe("DiaryComposer", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn((file: File) => `blob:${file.name}`),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("selects ordered images and sends them with long text", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    const first = new File(["one"], "first.png", { type: "image/png" });
    const second = new File(["two"], "second.jpg", { type: "image/jpeg" });
    const longText = "沿着河边慢慢走回家。".repeat(18);

    render(<DiaryComposer onSend={onSend} />);

    const input = screen.getByLabelText("Add diary images");
    expect(input).toHaveAttribute("accept", "image/*");
    expect(input).not.toHaveAttribute("capture");
    expect(input).toHaveAttribute("multiple");
    await user.upload(input, [first, second]);

    expect(screen.getByRole("img", { name: "Selected image first.png" }))
      .toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Selected image second.jpg" }))
      .toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Diary text" }), {
      target: { value: longText },
    });
    await user.click(screen.getByRole("button", { name: "Send diary entry" }));

    expect(onSend).toHaveBeenCalledWith({ text: longText, files: [first, second] });
    await waitFor(() => {
      expect(screen.queryByRole("img", { name: "Selected image first.png" }))
        .not.toBeInTheDocument();
    });
  });

  it("adds pasted images and allows removal before send", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    const pasted = new File(["pasted"], "clipboard.png", { type: "image/png" });

    render(<DiaryComposer onSend={onSend} />);

    fireEvent.paste(screen.getByRole("textbox", { name: "Diary text" }), {
      clipboardData: {
        items: [
          {
            getAsFile: () => pasted,
            kind: "file",
            type: "image/png",
          },
        ],
      },
    });
    expect(
      screen.getByRole("img", { name: "Selected image clipboard.png" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Remove selected image clipboard.png" }),
    );
    expect(
      screen.queryByRole("img", { name: "Selected image clipboard.png" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send diary entry" })).toBeDisabled();
  });
});
