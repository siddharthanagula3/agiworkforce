/**
 * static-html.snapshot.test.ts — structural visual-verification for the
 * Chrome extension's static HTML surfaces.
 *
 * Locks the HTML shape so any layout drift fires a snapshot diff.
 * Phase 3 (2026-06-14): popup.html has been deleted (retired in favor of the
 * side-panel ⋮ settings drawer). Only side_panel.html is snapshotted now.
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
  it('locks the side_panel.html structure', () => {
    expect(readSrc('side_panel.html')).toMatchSnapshot();
  });
});
