#!/usr/bin/env tsx
/* eslint-disable no-console -- CLI tool; stdout/log is the intended output channel */

import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

import { SCREENSHOTS, deviceForClassName } from './catalog';

const BG_TOP = '#0f0f0f';
const BG_BOTTOM = '#171717';
const ACCENT = '#10a37f';
const HEADING_COLOR = '#f5f5f5';
const SUBHEAD_COLOR = '#a3a3a3';

interface Args {
  raw: string;
  out: string;
  heading: string;
  subhead: string;
  width: number;
  height: number;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const raw = get('--raw');
  const out = get('--out');
  const heading = get('--heading');
  const subhead = get('--subhead');
  const width = get('--width');
  const height = get('--height');
  if (!raw || !out || !heading || !subhead || !width || !height) {
    throw new Error(
      'Usage: compositor.ts --raw <path> --out <path> --heading <str> --subhead <str> --width <n> --height <n>',
    );
  }
  return { raw, out, heading, subhead, width: Number(width), height: Number(height) };
}

function drawBackgroundAndText(args: Args): Buffer {
  const { width, height, heading, subhead } = args;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, BG_TOP);
  bg.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const headingSize = Math.round(width * 0.062);
  const subheadSize = Math.round(width * 0.03);
  const textTop = height * 0.06;
  const centerX = width / 2;

  ctx.textAlign = 'center';
  ctx.fillStyle = HEADING_COLOR;
  ctx.font = `700 ${headingSize}px sans-serif`;
  ctx.fillText(heading, centerX, textTop + headingSize, width * 0.9);

  const accentY = textTop + headingSize + subheadSize * 0.6;
  const accentWidth = width * 0.12;
  ctx.fillStyle = ACCENT;
  ctx.fillRect(
    centerX - accentWidth / 2,
    accentY,
    accentWidth,
    Math.max(3, Math.round(width * 0.004)),
  );

  ctx.fillStyle = SUBHEAD_COLOR;
  ctx.font = `500 ${subheadSize}px sans-serif`;
  ctx.fillText(subhead, centerX, accentY + subheadSize * 2, width * 0.85);

  return canvas.toBuffer('image/png');
}

async function composite(args: Args): Promise<void> {
  const { raw, out, width, height } = args;
  if (!existsSync(raw)) {
    throw new Error(`Raw capture not found: ${raw}`);
  }

  const backgroundPng = drawBackgroundAndText(args);

  const frameMaxHeight = Math.round(height * 0.78);
  const frameMaxWidth = Math.round(width * 0.86);
  const rawMeta = await sharp(raw).metadata();
  const rawWidth = rawMeta.width ?? width;
  const rawHeight = rawMeta.height ?? height;
  const scale = Math.min(frameMaxWidth / rawWidth, frameMaxHeight / rawHeight);
  const frameWidth = Math.round(rawWidth * scale);
  const frameHeight = Math.round(rawHeight * scale);

  const resizedRaw = await sharp(raw).resize(frameWidth, frameHeight).png().toBuffer();

  const frameLeft = Math.round((width - frameWidth) / 2);
  const frameTop = Math.round(height - frameHeight - height * 0.06);

  mkdirSync(dirname(out), { recursive: true });
  await sharp(backgroundPng)
    .composite([{ input: resizedRaw, left: frameLeft, top: frameTop }])
    .resize(width, height)
    .png()
    .toFile(out);

  console.log(`Composited ${out}`);
}

async function recomposeAll(): Promise<void> {
  const root = resolve(__dirname, '..', '..', 'store-listing', 'screenshots', 'captures');
  if (!existsSync(root)) {
    console.log(`No captures found at ${root}`);
    return;
  }
  for (const platform of readdirSync(root)) {
    const platformDir = join(root, platform);
    for (const className of readdirSync(platformDir)) {
      const rawDir = join(platformDir, className, 'raw');
      const finalDir = join(platformDir, className, 'final');
      if (!existsSync(rawDir)) continue;
      const device = deviceForClassName(className);
      if (!device) {
        console.log(`Skipping ${platform}/${className}: no device class in the catalog`);
        continue;
      }
      for (const shot of SCREENSHOTS) {
        const rawFile = join(rawDir, `${shot.id}-${shot.name}.png`);
        if (!existsSync(rawFile)) continue;
        await composite({
          raw: rawFile,
          out: join(finalDir, `${shot.id}-${shot.name}.png`),
          heading: shot.heading,
          subhead: shot.subhead,
          width: device.width,
          height: device.height,
        });
      }
    }
  }
}

async function main() {
  (GlobalFonts as unknown as { loadSystemFonts?: () => void }).loadSystemFonts?.();
  const argv = process.argv.slice(2);
  if (argv.includes('--recompose-all')) {
    await recomposeAll();
    return;
  }
  await composite(parseArgs(argv));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
