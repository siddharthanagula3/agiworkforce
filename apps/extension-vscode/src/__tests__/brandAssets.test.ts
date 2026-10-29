import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

function pngDimensions(filePath: string): { width: number; height: number } {
  const bytes = fs.readFileSync(filePath);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

describe('VS Code AGI brand assets', () => {
  const mediaDir = path.resolve(__dirname, '../../media');

  it('uses the symbol artwork in workbench navigation', () => {
    const symbol = fs.readFileSync(path.join(mediaDir, 'agi-symbol.png'));
    expect([...symbol.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(pngDimensions(path.join(mediaDir, 'agi-symbol.png'))).toEqual({
      width: 512,
      height: 512,
    });
    expect(fs.existsSync(path.join(mediaDir, 'icon-sidebar.svg'))).toBe(false);
  });

  it('ships crisp marketplace and chat icon sizes from the brand mark', () => {
    expect(pngDimensions(path.join(mediaDir, 'icon.png'))).toEqual({
      width: 128,
      height: 128,
    });
    expect(pngDimensions(path.join(mediaDir, 'icon-chat.png'))).toEqual({
      width: 32,
      height: 32,
    });
    expect(fs.existsSync(path.join(mediaDir, 'icon-source.svg'))).toBe(false);
  });
});
