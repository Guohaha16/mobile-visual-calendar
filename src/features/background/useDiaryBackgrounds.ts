import { useEffect, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import type { BackgroundPreference } from "../../domain/types";
import type { DiaryRepository } from "../../data/local/diaryRepository";
import type { DiaryBackgroundAsset } from "./types";

const randomPreference: BackgroundPreference = { mode: "random" };

export function useDiaryBackgrounds(repository: DiaryRepository) {
  const sourceAssets = useLiveQuery(
    async () => {
      const images = await repository.listDiaryImages();
      const assets = await Promise.all(
        images.map(async (image) => {
          const entry = await repository.getEntry(image.entryId);
          return entry === undefined ? undefined : { entry, image };
        }),
      );

      return assets.filter(
        (
          item,
        ): item is {
          entry: NonNullable<typeof item>["entry"];
          image: NonNullable<typeof item>["image"];
        } => item !== undefined,
      );
    },
    [repository],
    [],
  );
  const preference =
    useLiveQuery(
      () => repository.getBackgroundPreference(),
      [repository],
      randomPreference,
    ) ?? randomPreference;

  const { assets, objectUrls } = useMemo(() => {
    const urls: string[] = [];
    const mappedAssets = sourceAssets.flatMap<DiaryBackgroundAsset>(
      ({ entry, image }) => {
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
      await repository.setBackgroundPreference(value);
    },
  };
}
