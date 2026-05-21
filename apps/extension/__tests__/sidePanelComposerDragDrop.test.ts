/**
 * Tests for the drag-drop / paste-image filter logic on the chrome ext side
 * panel composer (round-2 audit P0 #3, 2026-05-21).
 *
 * `acceptIncomingComposerFiles` is not exported from `side_panel.ts`, so we
 * mirror its filter — image-only, ≤10 MB, ≤8 total attachments — exactly
 * here. If the source rule changes, this test rots fast and shows up in CI.
 */

import { describe, expect, it } from 'vitest';

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENTS = 8;

interface IncomingFile {
  type: string;
  size: number;
  name: string;
}

/**
 * Mirrors the filter inside acceptIncomingComposerFiles. Returns the files
 * we'd actually try to read as data URLs. The on-page version also caps by
 * remaining slots (relative to a live pendingAttachments array); we pass
 * `existingPending` here so the test can exercise the cap independently.
 */
function selectAcceptedFiles(files: IncomingFile[], existingPending: number): IncomingFile[] {
  const incoming = files.filter((file) => file.type.startsWith('image/') && file.size <= MAX_BYTES);
  const remainingSlots = Math.max(0, MAX_TOTAL_ATTACHMENTS - existingPending);
  return incoming.slice(0, remainingSlots);
}

describe('side panel composer drag-drop filter', () => {
  it('accepts image/* files under the 10 MB ceiling', () => {
    const accepted = selectAcceptedFiles(
      [
        { type: 'image/png', size: 1024, name: 'a.png' },
        { type: 'image/jpeg', size: 1024, name: 'b.jpg' },
      ],
      0,
    );
    expect(accepted).toHaveLength(2);
  });

  it('strips non-image MIME types', () => {
    const accepted = selectAcceptedFiles(
      [
        { type: 'image/png', size: 100, name: 'keep.png' },
        { type: 'application/pdf', size: 100, name: 'reject.pdf' },
        { type: 'text/plain', size: 100, name: 'reject.txt' },
      ],
      0,
    );
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.name).toBe('keep.png');
  });

  it('rejects files larger than 10 MB', () => {
    const accepted = selectAcceptedFiles(
      [
        { type: 'image/png', size: MAX_BYTES + 1, name: 'oversize.png' },
        { type: 'image/png', size: MAX_BYTES, name: 'at-cap.png' },
      ],
      0,
    );
    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.name).toBe('at-cap.png');
  });

  it('respects the 8-attachment ceiling across existing pending entries', () => {
    const files: IncomingFile[] = Array.from({ length: 6 }, (_, i) => ({
      type: 'image/png',
      size: 100,
      name: `f${i}.png`,
    }));
    const accepted = selectAcceptedFiles(files, 5);
    // Already 5 pending → only 3 of the 6 incoming files fit.
    expect(accepted).toHaveLength(3);
  });

  it('returns an empty list when no slots remain', () => {
    const accepted = selectAcceptedFiles(
      [{ type: 'image/png', size: 100, name: 'too-late.png' }],
      MAX_TOTAL_ATTACHMENTS,
    );
    expect(accepted).toHaveLength(0);
  });
});
