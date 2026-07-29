import { useMemo } from "react";

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
  const asset = useMemo(() => {
    const resolved = resolveBackground(preference, assets, random);
    return resolved.asset === undefined
      ? undefined
      : assets.find((candidate) => candidate.id === resolved.asset?.id);
  }, [assets, preference, random]);

  const classes = [
    styles.scene,
    asset === undefined ? styles.fallback : "",
    asset === undefined ? "fallback" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      data-luminance={asset?.luminance ?? "light"}
      data-testid="background-scene"
    >
      {asset === undefined ? null : (
        <>
          <img alt="" className={styles.image} src={asset.url} />
          <div className={styles.scrim} />
        </>
      )}
    </div>
  );
}
