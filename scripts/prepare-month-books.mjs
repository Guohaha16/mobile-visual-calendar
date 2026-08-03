import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import sharp from "sharp";

const [inputDirectory, outputDirectory] = process.argv.slice(2);
if (inputDirectory === undefined || outputDirectory === undefined) {
  throw new Error(
    "Usage: node scripts/prepare-month-books.mjs <input-directory> <output-directory>",
  );
}

const templatePath = path.join(
  process.cwd(),
  "public",
  "assets",
  "calendar-book.png",
);

const sampleCoverColor = async (source) => {
  const metadata = await sharp(source).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width === 0 || height === 0) {
    throw new Error(`Unable to read cover dimensions from ${source}`);
  }

  const sample = await sharp(source)
    .extract({
      left: Math.round(width * 0.43),
      top: Math.round(height * 0.23),
      width: Math.max(1, Math.round(width * 0.12)),
      height: Math.max(1, Math.round(height * 0.12)),
    })
    .resize(1, 1)
    .removeAlpha()
    .raw()
    .toBuffer();

  return [sample[0] ?? 0, sample[1] ?? 0, sample[2] ?? 0];
};

const luminance = (red, green, blue) =>
  red * 0.2126 + green * 0.7152 + blue * 0.0722;

const recolorTemplate = async (targetColor, destination) => {
  const { data, info } = await sharp(templatePath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const output = Buffer.from(data);

  const templateSample = await sharp(templatePath)
    .extract({
      left: Math.round(info.width * 0.36),
      top: Math.round(info.height * 0.08),
      width: Math.max(1, Math.round(info.width * 0.28)),
      height: Math.max(1, Math.round(info.height * 0.12)),
    })
    .resize(1, 1)
    .removeAlpha()
    .raw()
    .toBuffer();
  const templateBaseLuminance = Math.max(
    1,
    luminance(
      templateSample[0] ?? 0,
      templateSample[1] ?? 0,
      templateSample[2] ?? 0,
    ),
  );

  for (let offset = 0; offset < output.length; offset += 4) {
    const alpha = data[offset + 3] ?? 0;
    if (alpha === 0) {
      continue;
    }

    const red = data[offset] ?? 0;
    const green = data[offset + 1] ?? 0;
    const blue = data[offset + 2] ?? 0;
    const lightest = Math.max(red, green, blue);
    const darkest = Math.min(red, green, blue);
    const chroma = lightest - darkest;

    // Preserve white lettering and neutral cast shadows from the original
    // template. Only the blue cloth fibers receive the target cover color.
    const isLettering = lightest >= 175 && chroma <= 48;
    const isNeutralShadow = lightest <= 72 && chroma <= 22;
    if (isLettering || isNeutralShadow) {
      continue;
    }

    const lightRatio = Math.min(
      2.4,
      luminance(red, green, blue) / templateBaseLuminance,
    );
    output[offset] = Math.min(255, Math.round(targetColor[0] * lightRatio));
    output[offset + 1] = Math.min(
      255,
      Math.round(targetColor[1] * lightRatio),
    );
    output[offset + 2] = Math.min(
      255,
      Math.round(targetColor[2] * lightRatio),
    );
  }

  await sharp(output, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .webp({ alphaQuality: 95, effort: 5, quality: 86 })
    .toFile(destination);
};

await mkdir(outputDirectory, { recursive: true });
for (let sourceNumber = 1; sourceNumber <= 11; sourceNumber += 1) {
  const source = path.join(inputDirectory, `${sourceNumber}.png`);
  await recolorTemplate(
    await sampleCoverColor(source),
    path.join(outputDirectory, `${sourceNumber}.webp`),
  );
}

await sharp(templatePath)
  .webp({ alphaQuality: 95, effort: 5, quality: 86 })
  .toFile(path.join(outputDirectory, "12.webp"));
