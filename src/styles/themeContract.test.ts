import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const tokensCss = readFileSync("src/styles/tokens.css", "utf8");
const backgroundPickerCss = readFileSync(
  "src/features/background/BackgroundPicker.module.css",
  "utf8",
);

describe("editorial theme contract", () => {
  it("defines the approved home and command colors", () => {
    expect(tokensCss).toContain("--color-canvas: #F2F2EF;");
    expect(tokensCss).toContain("--color-ink: #181716;");
    expect(tokensCss).toContain("--color-primary: #EA632F;");
    expect(tokensCss).toContain("--color-active: #E34B4A;");
  });

  it("keeps calendar paper separate from neutral glass", () => {
    expect(tokensCss).toContain("--color-paper: #F7F1E7;");
    expect(tokensCss).toContain(
      "--color-glass: rgb(255 255 255 / 72%);",
    );
    expect(tokensCss).toContain(
      "--shadow-glass: 0 12px 36px rgb(24 23 22 / 12%);",
    );
  });

  it("keeps the home background picker neutral", () => {
    expect(backgroundPickerCss).toContain(
      "background: rgb(255 255 255 / 78%);",
    );
    expect(backgroundPickerCss).toContain(
      "box-shadow: 0 -14px 40px rgb(24 23 22 / 16%);",
    );
    expect(backgroundPickerCss).not.toContain("255 252 247");
    expect(backgroundPickerCss).not.toContain("72 57 48");
  });
});
