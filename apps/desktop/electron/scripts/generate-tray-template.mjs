/**
 * Generate the macOS/Windows tray template icons.
 *
 * The app icons under `src-tauri/icons` are full-bleed colored badges (a dark
 * square with wordmark), so deriving a template from their alpha channel
 * produces a solid black square — unusable in a menu bar. This draws a
 * purpose-built monochrome glyph instead: a filled speech bubble, which is
 * what reads at 16px and matches the macOS template convention (black pixels
 * + alpha; the OS recolors for light/dark menu bars and inverts on click).
 *
 * Dependency-free on purpose (no sharp/pngjs in this package): a hand-rolled
 * PNG writer over node:zlib. Run manually after changing the glyph:
 *   node apps/desktop/electron/scripts/generate-tray-template.mjs
 * The emitted PNGs are committed; the build only copies them.
 */
// Node builtins are imported rather than used as globals: the repo eslint
// config does not grant Node globals to plain .mjs files.
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, '..', 'assets');

// --- PNG encoding -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** @param rgba {Buffer} width*height*4 bytes. */
function encodePng(rgba, width, height) {
  const stride = width * 4;
  // One filter byte (0 = None) per scanline.
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Glyph ------------------------------------------------------------------
// All geometry is expressed in a 16x16 design space and sampled at the target
// resolution, so 1x and 2x are the same shape rather than a rescale.

const DESIGN = 16;

function insideRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function insideTriangle(x, y, ax, ay, bx, by, cx, cy) {
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** Speech bubble: rounded body plus a tail dropping from the lower left. */
function insideGlyph(x, y) {
  return (
    insideRoundedRect(x, y, 1.4, 1.6, 14.6, 11.4, 3.2) ||
    insideTriangle(x, y, 4.2, 8.6, 4.2, 14.6, 9.4, 10.9)
  );
}

function renderTemplate(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const scale = DESIGN / size;
  const SS = 4; // 4x4 supersampling for the alpha edge
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let hits = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = (px + (sx + 0.5) / SS) * scale;
          const y = (py + (sy + 0.5) / SS) * scale;
          if (insideGlyph(x, y)) hits += 1;
        }
      }
      const offset = (py * size + px) * 4;
      // Template images are pure black; only alpha carries the shape.
      rgba[offset] = 0;
      rgba[offset + 1] = 0;
      rgba[offset + 2] = 0;
      rgba[offset + 3] = Math.round((hits / (SS * SS)) * 255);
    }
  }
  return encodePng(rgba, size, size);
}

mkdirSync(ASSETS_DIR, { recursive: true });
for (const [size, name] of [
  [16, 'trayTemplate.png'],
  [32, 'trayTemplate@2x.png'],
]) {
  const file = path.join(ASSETS_DIR, name);
  writeFileSync(file, renderTemplate(size));
  console.log(`wrote ${file} (${size}x${size})`);
}
