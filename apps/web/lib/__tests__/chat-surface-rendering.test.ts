import { describe, expect, it } from 'vitest';

import { surfaceRendersWritingCards } from '../chat-surface-rendering';

const OTHER_SURFACES = ['mobile', 'chrome', 'vscode', 'cli', 'unknown'] as const;

describe('what each chat client renders of a turn', () => {
  it('renders email and writing blocks as cards in the web chat and the desktop app only', () => {
    expect(surfaceRendersWritingCards('web')).toBe(true);
    expect(surfaceRendersWritingCards('desktop')).toBe(true);
    for (const surface of OTHER_SURFACES) {
      expect(surfaceRendersWritingCards(surface), surface).toBe(false);
    }
  });
});
