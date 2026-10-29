import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(appDir, '../public');

function pngDimensions(filePath: string): { width: number; height: number } {
  const bytes = readFileSync(filePath);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

describe('web AGI brand assets', () => {
  it('uses the symbol artwork for the browser icon', () => {
    const icon = readFileSync(join(appDir, 'icon.png'));
    const symbol = readFileSync(join(publicDir, 'agi-symbol.png'));
    expect([...icon.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(icon.equals(symbol)).toBe(true);
    expect(pngDimensions(join(appDir, 'icon.png'))).toEqual({ width: 512, height: 512 });
  });

  it('ships a real multi-resolution favicon', () => {
    const favicon = readFileSync(join(appDir, 'favicon.ico'));
    expect([...favicon.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
    expect(favicon.readUInt16LE(4)).toBe(4);
  });

  it.each([
    ['apple-touch-icon.png', 180],
    ['logo-192.png', 192],
    ['logo-512.png', 512],
  ])('ships %s at %ipx', (fileName, size) => {
    expect(pngDimensions(join(publicDir, fileName))).toEqual({
      width: size,
      height: size,
    });
  });
});
