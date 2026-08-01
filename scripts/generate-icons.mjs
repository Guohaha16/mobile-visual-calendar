import { mkdir } from "node:fs/promises";
import sharp from "sharp";

await mkdir("public/icons", { recursive: true });

function iconSvg(size, maskable = false) {
  const pad = maskable ? size * 0.18 : size * 0.1;
  const paperX = pad;
  const paperY = pad * 1.22;
  const paperWidth = size - pad * 2;
  const paperHeight = size - paperY - pad;
  const cell = paperWidth / 4;
  const colors = ["#1f3048", "#6f92a8", "#6f9479", "#e88ab1"];
  const cells = colors
    .map(
      (color, index) =>
        `<rect x="${paperX + index * cell}" y="${paperY + paperHeight * 0.48}" width="${cell}" height="${paperHeight * 0.52}" fill="${color}"/>`,
    )
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="#f2f2ef"/>
      <rect x="${paperX}" y="${paperY}" width="${paperWidth}" height="${paperHeight}" rx="${size * 0.025}" fill="#fbfcfa"/>
      ${cells}
      <rect x="${size * 0.35}" y="${pad * 0.72}" width="${size * 0.3}" height="${size * 0.12}" rx="${size * 0.04}" fill="#aeb7ba"/>
      <circle cx="${size * 0.5}" cy="${pad * 0.72}" r="${size * 0.045}" fill="#edf1f2"/>
    </svg>
  `;
}

await Promise.all([
  sharp(Buffer.from(iconSvg(192)))
    .png()
    .toFile("public/icons/icon-192.png"),
  sharp(Buffer.from(iconSvg(512)))
    .png()
    .toFile("public/icons/icon-512.png"),
  sharp(Buffer.from(iconSvg(512, true)))
    .png()
    .toFile("public/icons/maskable-512.png"),
]);
