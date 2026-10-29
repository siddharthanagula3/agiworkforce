import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

function pngDimensions(filePath: string): { width: number; height: number } {
  const bytes = fs.readFileSync(filePath);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

describe('Chrome extension AGI brand icons', () => {
  const appDir = path.resolve(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(appDir, 'manifest.json'), 'utf8')) as {
    icons: Record<string, string>;
  };

  it('ships the symbol artwork for in-panel marks', () => {
    const symbol = fs.readFileSync(path.join(appDir, 'icons/agi-symbol.png'));
    expect([...symbol.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(pngDimensions(path.join(appDir, 'icons/agi-symbol.png'))).toEqual({
      width: 512,
      height: 512,
    });
    expect(fs.existsSync(path.join(appDir, 'icons/icon-source.svg'))).toBe(false);
  });

  for (const size of [16, 32, 48, 128]) {
    it(`ships a ${size}px manifest icon`, () => {
      const relativePath = manifest.icons[String(size)];
      expect(relativePath).toBe(`icons/icon${size}.png`);
      expect(pngDimensions(path.join(appDir, relativePath))).toEqual({
        width: size,
        height: size,
      });
    });
  }
});
