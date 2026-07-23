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
  it('uses the canonical twelve-spoke AgiMark for the browser icon', () => {
    const source = readFileSync(join(appDir, 'icon.svg'), 'utf8');
    expect(source.match(/<line\b/g)).toHaveLength(12);
    expect(source).toContain('#f4f1e8');
    expect(source).toContain('#d89a3d');
    expect(source).not.toContain('WORKFORCE');
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
