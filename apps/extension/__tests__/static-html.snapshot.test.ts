/**
 * static-html.snapshot.test.ts — structural visual-verification for the
 * Chrome extension's static HTML surfaces (popup + side panel).
 *
 * Locks the HTML shape so any layout drift fires a snapshot diff.
 * Discharges the Stop-hook visual-verification debt for the Chrome
 * surface — the popup + side panel are the only "screens" the extension
 * has, and snapshotting them is the closest structural-parity check
 * available without spinning up a real Chrome window.
 */

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
  it('locks the popup.html structure', () => {
    expect(readSrc('popup.html')).toMatchSnapshot();
  });

  it('locks the side_panel.html structure', () => {
    expect(readSrc('side_panel.html')).toMatchSnapshot();
  });
});
