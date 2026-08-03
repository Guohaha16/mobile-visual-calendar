import type {
  CalendarBackgroundSurface,
  BackgroundPreference,
  BackgroundPreferences,
  MediaAsset,
} from "./types";

export type ResolvedBackground =
  | {
      mode: "solid";
      asset: undefined;
    }
  | {
      mode: "pinned";
      asset: MediaAsset;
    }
  | {
      mode: "random";
      asset: MediaAsset | undefined;
    };

export const defaultBackgroundPreferences = (): BackgroundPreferences => ({
  home: { mode: "solid" },
  calendar: { mode: "solid" },
  calendarMonths: {},
});

export const calendarBackgroundSurface = (
  year: number,
  month: number,
): CalendarBackgroundSurface => {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError("Calendar background year must be an integer from 1 to 9999");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError("Calendar background month must be an integer from 1 to 12");
  }

  return `calendar:${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
};

export const normalizeBackgroundPreferences = (
  value: BackgroundPreferences | BackgroundPreference,
): BackgroundPreferences => {
  if ("home" in value && "calendar" in value) {
    return {
      ...value,
      calendarMonths: value.calendarMonths ?? {},
    };
  }

  return {
    home: value,
    calendar: value,
    calendarMonths: {},
  };
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
  if (preference.mode === "solid") {
    return { mode: "solid", asset: undefined };
  }

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
