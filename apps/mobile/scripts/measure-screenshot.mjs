#!/usr/bin/env node
/* global console */

import process from 'node:process';
import sharp from 'sharp';

const USAGE = `Pixel measurements on a screenshot. Every rectangle and every number is in pixels of the
original image; divide by the device scale (3 on current iPhones) for points.

  measure-screenshot.mjs info  <image>
  measure-screenshot.mjs crop  <image> <x> <y> <w> <h> <out.png> [zoom]
  measure-screenshot.mjs bg    <image> <x> <y> <w> <h>
  measure-screenshot.mjs boxes <image> <x> <y> <w> <h> [tolerance] [gap]
  measure-screenshot.mjs rows  <image> <x> <y> <w> <h> [tolerance]
  measure-screenshot.mjs cols  <image> <x> <y> <w> <h> [tolerance]
  measure-screenshot.mjs pixel <image> <x> <y>
  measure-screenshot.mjs hline <image> <y> [tolerance]
  measure-screenshot.mjs vline <image> <x> [tolerance]

boxes  connected shapes that differ from the region's background (the commonest colour on its
       border) by more than tolerance; shapes closer than gap pixels are merged
rows   vertical extent of each line of text or control in the region
cols   horizontal extent of each glyph or control in the region
hline  colour runs along one full row of the image, for the edges of cards, bars and pills
vline  colour runs along one full column of the image`;

const [, , command, file, ...rest] = process.argv;
const numbers = rest.map((value) => Number(value));

const hex = (r, g, b) =>
  `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

async function load() {
  const { data, info } = await sharp(file)
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels,
  };
}

function at(image, x, y) {
  const offset = (y * image.width + x) * image.channels;
  return [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
}

function distance(a, b) {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

function clampRegion(image, x, y, w, h) {
  const left = Math.max(0, Math.min(image.width - 1, Math.round(x)));
  const top = Math.max(0, Math.min(image.height - 1, Math.round(y)));
  const right = Math.max(left + 1, Math.min(image.width, Math.round(x + w)));
  const bottom = Math.max(top + 1, Math.min(image.height, Math.round(y + h)));
  return { left, top, right, bottom };
}

function borderColour(image, region) {
  const counts = new Map();
  const vote = (x, y) => {
    const [r, g, b] = at(image, x, y);
    const key = (r << 16) | (g << 8) | b;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (let x = region.left; x < region.right; x += 1) {
    vote(x, region.top);
    vote(x, region.bottom - 1);
  }
  for (let y = region.top; y < region.bottom; y += 1) {
    vote(region.left, y);
    vote(region.right - 1, y);
  }
  let best = 0;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return [(best >> 16) & 255, (best >> 8) & 255, best & 255];
}

function foregroundMask(image, region, tolerance) {
  const background = borderColour(image, region);
  const width = region.right - region.left;
  const height = region.bottom - region.top;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (distance(at(image, region.left + x, region.top + y), background) > tolerance) {
        mask[y * width + x] = 1;
      }
    }
  }
  return { mask, width, height, background };
}

function runs(flags, origin) {
  const found = [];
  let start = -1;
  for (let index = 0; index <= flags.length; index += 1) {
    const on = index < flags.length && flags[index];
    if (on && start < 0) start = index;
    if (!on && start >= 0) {
      found.push({
        start: origin + start,
        end: origin + index,
        size: index - start,
      });
      start = -1;
    }
  }
  return found;
}

function dominantColour(image, box, background, tolerance) {
  const counts = new Map();
  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) {
      const colour = at(image, x, y);
      if (distance(colour, background) <= tolerance) continue;
      const key = ((colour[0] >> 3) << 10) | ((colour[1] >> 3) << 5) | (colour[2] >> 3);
      const entry = counts.get(key) ?? { count: 0, sum: [0, 0, 0] };
      entry.count += 1;
      entry.sum[0] += colour[0];
      entry.sum[1] += colour[1];
      entry.sum[2] += colour[2];
      counts.set(key, entry);
    }
  }
  let best = null;
  for (const entry of counts.values()) if (!best || entry.count > best.count) best = entry;
  if (!best) return 'none';
  return hex(
    Math.round(best.sum[0] / best.count),
    Math.round(best.sum[1] / best.count),
    Math.round(best.sum[2] / best.count),
  );
}

function boxes(image, region, tolerance, gap) {
  const { mask, width, height, background } = foregroundMask(image, region, tolerance);
  const labels = new Int32Array(width * height).fill(-1);
  const found = [];
  const stack = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || labels[index] >= 0) continue;
    const id = found.length;
    const box = { minX: width, minY: height, maxX: -1, maxY: -1, area: 0 };
    stack.push(index);
    labels[index] = id;
    while (stack.length) {
      const current = stack.pop();
      const x = current % width;
      const y = (current - x) / width;
      box.area += 1;
      if (x < box.minX) box.minX = x;
      if (x > box.maxX) box.maxX = x;
      if (y < box.minY) box.minY = y;
      if (y > box.maxY) box.maxY = y;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (mask[next] && labels[next] < 0) {
            labels[next] = id;
            stack.push(next);
          }
        }
      }
    }
    found.push(box);
  }
  let merged = found.filter((box) => box.area >= 4);
  let changed = gap > 0;
  while (changed) {
    changed = false;
    outer: for (let a = 0; a < merged.length; a += 1) {
      for (let b = a + 1; b < merged.length; b += 1) {
        const first = merged[a];
        const second = merged[b];
        const apartX = Math.max(first.minX, second.minX) - Math.min(first.maxX, second.maxX) - 1;
        const apartY = Math.max(first.minY, second.minY) - Math.min(first.maxY, second.maxY) - 1;
        if (apartX <= gap && apartY <= gap) {
          merged[a] = {
            minX: Math.min(first.minX, second.minX),
            minY: Math.min(first.minY, second.minY),
            maxX: Math.max(first.maxX, second.maxX),
            maxY: Math.max(first.maxY, second.maxY),
            area: first.area + second.area,
          };
          merged.splice(b, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  merged.sort((first, second) => first.minY - second.minY || first.minX - second.minX);
  console.log(`background ${hex(...background)} tolerance ${tolerance} gap ${gap}`);
  console.log('x\ty\tw\th\tright\tbottom\tarea\tcolour');
  for (const box of merged) {
    const absolute = {
      x: region.left + box.minX,
      y: region.top + box.minY,
      w: box.maxX - box.minX + 1,
      h: box.maxY - box.minY + 1,
    };
    console.log(
      [
        absolute.x,
        absolute.y,
        absolute.w,
        absolute.h,
        absolute.x + absolute.w,
        absolute.y + absolute.h,
        box.area,
        dominantColour(image, absolute, background, tolerance),
      ].join('\t'),
    );
  }
}

function lineRuns(image, fixed, horizontal, tolerance) {
  const length = horizontal ? image.width : image.height;
  let start = 0;
  let anchor = horizontal ? at(image, 0, fixed) : at(image, fixed, 0);
  console.log(horizontal ? 'x_start\tx_end\tlength\tcolour' : 'y_start\ty_end\tlength\tcolour');
  for (let index = 1; index <= length; index += 1) {
    const colour =
      index < length ? (horizontal ? at(image, index, fixed) : at(image, fixed, index)) : null;
    if (!colour || distance(colour, anchor) > tolerance) {
      if (index - start >= 3) {
        console.log([start, index, index - start, hex(...anchor)].join('\t'));
      }
      start = index;
      if (colour) anchor = colour;
    }
  }
}

async function main() {
  if (!command || !file) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  if (command === 'info') {
    const meta = await sharp(file).metadata();
    console.log(`${meta.width}x${meta.height} px`);
    return;
  }
  if (command === 'crop') {
    const [x, y, w, h] = numbers;
    const out = rest[4];
    const zoom = Number(rest[5] ?? 1);
    const meta = await sharp(file).metadata();
    const left = Math.max(0, Math.round(x));
    const top = Math.max(0, Math.round(y));
    const width = Math.min(meta.width - left, Math.round(w));
    const height = Math.min(meta.height - top, Math.round(h));
    await sharp(file)
      .extract({ left, top, width, height })
      .resize({ width: Math.round(width * zoom), kernel: 'nearest' })
      .png()
      .toFile(out);
    console.log(`wrote ${out} (${width}x${height} px at zoom ${zoom})`);
    return;
  }
  const image = await load();
  if (command === 'pixel') {
    const [x, y] = numbers;
    console.log(hex(...at(image, Math.round(x), Math.round(y))));
    return;
  }
  if (command === 'hline') {
    lineRuns(image, Math.round(numbers[0]), true, numbers[1] ?? 6);
    return;
  }
  if (command === 'vline') {
    lineRuns(image, Math.round(numbers[0]), false, numbers[1] ?? 6);
    return;
  }
  const region = clampRegion(image, numbers[0], numbers[1], numbers[2], numbers[3]);
  if (command === 'bg') {
    console.log(hex(...borderColour(image, region)));
    return;
  }
  if (command === 'boxes') {
    boxes(image, region, numbers[4] ?? 24, numbers[5] ?? 0);
    return;
  }
  if (command === 'rows' || command === 'cols') {
    const tolerance = numbers[4] ?? 24;
    const { mask, width, height, background } = foregroundMask(image, region, tolerance);
    const horizontal = command === 'rows';
    const flags = new Array(horizontal ? height : width).fill(false);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (mask[y * width + x]) flags[horizontal ? y : x] = true;
      }
    }
    console.log(`background ${hex(...background)} tolerance ${tolerance}`);
    console.log(horizontal ? 'y_start\ty_end\theight' : 'x_start\tx_end\twidth');
    for (const run of runs(flags, horizontal ? region.top : region.left)) {
      console.log([run.start, run.end, run.size].join('\t'));
    }
    return;
  }
  console.error(USAGE);
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
