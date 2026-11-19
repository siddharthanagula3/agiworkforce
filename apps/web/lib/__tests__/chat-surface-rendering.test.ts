import { describe, expect, it } from 'vitest';

import {
  surfacePublishesArtifactApps,
  surfaceRendersWritingCards,
} from '../chat-surface-rendering';

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

describe('where an artifact app can run', () => {
  it('publishes hosted artifacts from the web chat, the desktop app and the mobile app only', () => {
    expect(surfacePublishesArtifactApps('web')).toBe(true);
    expect(surfacePublishesArtifactApps('desktop')).toBe(true);
    expect(surfacePublishesArtifactApps('mobile')).toBe(true);
    for (const surface of ['chrome', 'vscode', 'cli', 'unknown'] as const) {
      expect(surfacePublishesArtifactApps(surface), surface).toBe(false);
    }
  });
});
