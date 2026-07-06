import sharp from 'sharp';
import {
  PREVIEW_JPEG_QUALITY,
  PREVIEW_MAX_EDGE,
  WATERMARK_FILL,
  WATERMARK_STROKE,
  WATERMARK_TEXT,
} from '@/lib/delivery/constants';

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
        `<text x="${x}" y="${y}" font-size="${fontSize}" font-family="PingFang TC, Noto Sans TC, sans-serif" font-weight="700" fill="${WATERMARK_FILL}" stroke="${WATERMARK_STROKE}" stroke-width="${strokeWidth}" paint-order="stroke fill" transform="rotate(-30 ${x} ${y})">${text}</text>`,
      );
    }
  }
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${tiles.join('')}</svg>`;
  return Buffer.from(svg);
}

export async function buildPreviewImage(input: Buffer): Promise<Buffer> {
  const resized = await sharp(input)
    .rotate()
    .resize({
      width: PREVIEW_MAX_EDGE,
      height: PREVIEW_MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toBuffer();

  const meta = await sharp(resized).metadata();
  const width = meta.width ?? PREVIEW_MAX_EDGE;
  const height = meta.height ?? PREVIEW_MAX_EDGE;

  const watermarkLayer = await sharp(buildWatermarkSvg(width, height))
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer();

  return sharp(resized)
    .composite([{ input: watermarkLayer, top: 0, left: 0 }])
    .jpeg({ quality: PREVIEW_JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}
