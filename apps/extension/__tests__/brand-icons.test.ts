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

  it('uses the canonical twelve-spoke source mark', () => {
    const source = fs.readFileSync(path.join(appDir, 'icons/icon-source.svg'), 'utf8');
    expect(source.match(/<line\b/g)).toHaveLength(12);
    expect(source).not.toContain('WORKFORCE');
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
