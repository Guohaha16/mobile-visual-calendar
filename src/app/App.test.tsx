import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the visual diary application shell", () => {
    render(<App />);

    expect(
      screen.getByRole("main", { name: "Visual diary" })
    ).toBeInTheDocument();
  });
});
