import { afterEach, describe, expect, it, vi } from "vitest";

import { generateUuid } from "./id";

describe("generateUuid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the native secure-context generator when available", () => {
    const randomUUID = vi.fn(() => "10000000-1000-4000-8000-100000000000");
    vi.stubGlobal("crypto", { randomUUID });

    expect(generateUuid()).toBe("10000000-1000-4000-8000-100000000000");
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it("generates a UUID v4 when randomUUID is unavailable on LAN HTTP", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(0));
    vi.stubGlobal("crypto", { getRandomValues });

    expect(generateUuid()).toBe("00000000-0000-4000-8000-000000000000");
    expect(getRandomValues).toHaveBeenCalledOnce();
  });
});
