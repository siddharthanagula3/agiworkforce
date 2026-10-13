import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { OG_CARD_SIZE, ogCard } from './card';

export const OG_FONT_FILES = [
  { file: 'Geist-Medium.ttf', name: 'Geist', weight: 500 },
  { file: 'Geist-SemiBold.ttf', name: 'Geist', weight: 600 },
  { file: 'Geist-Bold.ttf', name: 'Geist', weight: 700 },
  { file: 'Geist-ExtraBold.ttf', name: 'Geist', weight: 800 },
  { file: 'Newsreader-Bold.ttf', name: 'Newsreader', weight: 700 },
] as const;

function loadFonts() {
  return Promise.all(
    OG_FONT_FILES.map(async (font) => ({
      name: font.name,
      weight: font.weight,
      style: 'normal' as const,
      data: await readFile(join(process.cwd(), 'assets', 'og', font.file)),
    })),
  );
}

export async function GET(): Promise<ImageResponse> {
  return new ImageResponse(ogCard(), { ...OG_CARD_SIZE, fonts: await loadFonts() });
}
