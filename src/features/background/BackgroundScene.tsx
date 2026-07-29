import { useMemo, useState } from "react";

import type { BackgroundPreference } from "../../domain/types";
import { resolveBackground } from "../../domain/background";
import type { DiaryBackgroundAsset } from "./types";
import styles from "./BackgroundScene.module.css";

interface BackgroundSceneProps {
  assets: readonly DiaryBackgroundAsset[];
  preference: BackgroundPreference;
  random?: () => number;
}

const randomBackground = () => Math.random();

export function BackgroundScene({
  assets,
  preference,
  random = randomBackground,
}: BackgroundSceneProps) {
  const [failedAssetId, setFailedAssetId] = useState<string>();
  const asset = useMemo(() => {
    const resolved = resolveBackground(preference, assets, random);
    return resolved.asset === undefined
      ? undefined
      : assets.find((candidate) => candidate.id === resolved.asset?.id);
  }, [assets, preference, random]);
  const visibleAsset =
    asset?.id === failedAssetId ? undefined : asset;

  const classes = [
    styles.scene,
    visibleAsset === undefined ? styles.fallback : "",
    visibleAsset === undefined ? "fallback" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      data-luminance={visibleAsset?.luminance ?? "light"}
      data-testid="background-scene"
    >
      {visibleAsset === undefined ? null : (
        <>
          <img
            alt=""
            className={styles.image}
            onError={() => {
              setFailedAssetId(visibleAsset.id);
            }}
            onLoad={() => {
              setFailedAssetId(undefined);
            }}
            src={visibleAsset.url}
          />
          <div className={styles.scrim} />
        </>
      )}
    </div>
  );
}
