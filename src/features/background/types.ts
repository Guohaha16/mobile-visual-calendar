import type { MediaAsset } from "../../domain/types";

export interface DiaryBackgroundAsset extends MediaAsset {
  entryDate: string;
  luminance?: "dark" | "light";
  thumbnailUrl?: string;
  url: string;
}
