import type { BackgroundPreference, MediaAsset } from "./types";

export type ResolvedBackground =
  | {
      mode: "pinned";
      asset: MediaAsset;
    }
  | {
      mode: "random";
      asset: MediaAsset | undefined;
    };

const selectRandomAsset = (
  assets: readonly MediaAsset[],
  randomFn: () => number,
): MediaAsset | undefined => {
  if (assets.length === 0) {
    return undefined;
  }

  const randomValue = randomFn();
  const finiteValue = Number.isFinite(randomValue) ? randomValue : 0;
  const clampedValue = Math.min(Math.max(finiteValue, 0), 1);
  const index = Math.min(Math.floor(clampedValue * assets.length), assets.length - 1);

  return assets[index];
};

export const resolveBackground = (
  preference: BackgroundPreference,
  assets: readonly MediaAsset[],
  randomFn: () => number,
): ResolvedBackground => {
  if (preference.mode === "pinned") {
    const pinnedAsset = assets.find(
      (asset) => asset.id === preference.pinnedAssetId,
    );

    if (pinnedAsset !== undefined) {
      return { mode: "pinned", asset: pinnedAsset };
    }
  }

  return {
    mode: "random",
    asset: selectRandomAsset(assets, randomFn),
  };
};
