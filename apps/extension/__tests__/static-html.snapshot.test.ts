
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readSrc(file: string): string {
  return readFileSync(resolve(__dirname, '..', 'src', file), 'utf-8');
}

describe('Chrome extension static HTML snapshots', () => {
  it('locks the side_panel.html structure', () => {
    expect(readSrc('side_panel.html')).toMatchSnapshot();
  });
});
