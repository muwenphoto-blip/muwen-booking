import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  PREVIEW_JPEG_QUALITY,
  PREVIEW_MAX_EDGE,
  WATERMARK_FILL,
  WATERMARK_STROKE,
  WATERMARK_TEXT,
} from '@/lib/delivery/constants';

const WATERMARK_FONTS = [
  { file: 'noto-sans-tc-106-700-normal.woff2', range: 'U+6c50' },
  { file: 'noto-sans-tc-112-700-normal.woff2', range: 'U+7d0b, U+6620' },
  { file: 'noto-sans-tc-117-700-normal.woff2', range: 'U+50cf' },
] as const;

let watermarkFontCss: string | null = null;

function readFontBase64(fileName: string): string {
  const candidates = [
    join(process.cwd(), 'assets/fonts/watermark', fileName),
    join(process.cwd(), 'node_modules/@fontsource/noto-sans-tc/files', fileName),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    return readFileSync(path).toString('base64');
  }
  throw new Error(`找不到浮水印字型：${fileName}`);
}

function getWatermarkFontCss(): string {
  if (watermarkFontCss) return watermarkFontCss;
  const faces = WATERMARK_FONTS.map(({ file, range }) => {
    const base64 = readFontBase64(file);
    return `@font-face{font-family:'MuwenWM';src:url(data:font/woff2;base64,${base64}) format('woff2');font-weight:700;font-style:normal;unicode-range:${range};}`;
  });
  watermarkFontCss = faces.join('');
  return watermarkFontCss;
}

function buildWatermarkSvg(width: number, height: number): Buffer {
  const fontSize = Math.max(26, Math.round(Math.min(width, height) / 9));
  const strokeWidth = Math.max(2, Math.round(fontSize * 0.12));
  const text = WATERMARK_TEXT;
  const tiles: string[] = [];
  const stepX = fontSize * (text.length + 1.5);
  const stepY = fontSize * 2.6;
  for (let y = -height; y < height * 2; y += stepY) {
    for (let x = -width; x < width * 2; x += stepX) {
      tiles.push(
        `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="MuwenWM, sans-serif" font-weight="700" fill="${WATERMARK_FILL}" stroke="${WATERMARK_STROKE}" stroke-width="${strokeWidth}" paint-order="stroke fill" transform="rotate(-30 ${x} ${y})">${text}</text>`,
      );
    }
  }
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><defs><style>${getWatermarkFontCss()}</style></defs>${tiles.join('')}</svg>`;
  return Buffer.from(svg);
}

export async function buildResizedPreview(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({
      width: PREVIEW_MAX_EDGE,
      height: PREVIEW_MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: PREVIEW_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

export async function applyPreviewWatermark(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const width = meta.width ?? PREVIEW_MAX_EDGE;
  const height = meta.height ?? PREVIEW_MAX_EDGE;

  const watermarkLayer = await sharp(buildWatermarkSvg(width, height))
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer();

  const wmStats = await sharp(watermarkLayer).stats();
  const alphaMax = wmStats.channels[3]?.max ?? 0;
  if (alphaMax < 8) {
    throw new Error('浮水印產生失敗');
  }

  return sharp(input)
    .composite([{ input: watermarkLayer, top: 0, left: 0 }])
    .jpeg({ quality: PREVIEW_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

/** Upload path: resize and store without watermark (watermark is applied when serving). */
export async function buildPreviewImage(input: Buffer): Promise<Buffer> {
  return buildResizedPreview(input);
}

/** Serve path: watermark stored preview (already resized on upload). */
export async function buildPreviewForDisplay(input: Buffer): Promise<Buffer> {
  return applyPreviewWatermark(input);
}
