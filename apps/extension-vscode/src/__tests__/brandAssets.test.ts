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

  it('uses the canonical twelve-spoke mark in the activity bar', () => {
    const svg = fs.readFileSync(path.join(mediaDir, 'icon-sidebar.svg'), 'utf8');
    expect(svg.match(/<line\b/g)).toHaveLength(12);
    expect(svg).not.toContain('Robot head');
    expect(svg).not.toContain('<rect');
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
    const source = fs.readFileSync(path.join(mediaDir, 'icon-source.svg'), 'utf8');
    expect(source.match(/<line\b/g)).toHaveLength(12);
  });
});
