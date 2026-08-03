import { useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import type {
  BackgroundPreference,
  BackgroundSurface,
} from "../../domain/types";
import type { DiaryRepository } from "../../data/local/diaryRepository";
import type { DiaryBackgroundAsset } from "./types";
import {
  classifyImageLuminance,
  type ImageLuminance,
} from "./luminance";

const defaultPreference: BackgroundPreference = { mode: "solid" };

export function useDiaryBackgrounds(
  repository: DiaryRepository,
  surface: BackgroundSurface,
  classifyLuminance: (blob: Blob) => Promise<ImageLuminance> =
    classifyImageLuminance,
) {
  const sourceAssets = useLiveQuery(
    async () => {
      const images = await repository.listDiaryImages();
      const assets = await Promise.all(
        images.map(async (image) => {
          const entry = await repository.getEntry(image.entryId);
          const blob = image.thumbnailBlob ?? image.localBlob;
          if (entry === undefined || blob === undefined) {
            return undefined;
          }

          return {
            entry,
            image,
            luminance: await classifyLuminance(blob),
          };
        }),
      );

      return assets.filter(
        (
          item,
        ): item is {
          entry: NonNullable<typeof item>["entry"];
          image: NonNullable<typeof item>["image"];
          luminance: NonNullable<typeof item>["luminance"];
        } => item !== undefined,
      );
    },
    [repository, classifyLuminance],
    [],
  );
  const preference =
    useLiveQuery(
      () => repository.getBackgroundPreference(surface),
      [repository, surface],
      defaultPreference,
    ) ?? defaultPreference;

  const { assets, objectUrls } = useMemo(() => {
    const urls: string[] = [];
    const mappedAssets = sourceAssets.flatMap<DiaryBackgroundAsset>(
      ({ entry, image, luminance }) => {
        const blob = image.thumbnailBlob ?? image.localBlob;
        if (blob === undefined || typeof URL.createObjectURL !== "function") {
          return [];
        }

        const url = URL.createObjectURL(blob);
        urls.push(url);
        return [
          {
            ...image,
            entryDate: entry.entryDate,
            luminance,
            url,
          },
        ];
      },
    );

    return { assets: mappedAssets, objectUrls: urls };
  }, [sourceAssets]);

  useEffect(
    () => () => {
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
    },
    [objectUrls],
  );

  return {
    assets,
    preference,
    setPreference: async (value: BackgroundPreference) => {
      await repository.setBackgroundPreference(surface, value);
    },
  };
}
