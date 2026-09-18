import { describe, expect, it } from 'vitest';

import { MEDIA_METRIC_NAME } from './media-telemetry';
import { METRIC_NAME } from './metrics';

/**
 * metrics.ts cannot import media-telemetry.ts: that module imports span.ts,
 * which imports metrics.ts, and the cycle leaves METRIC_NAME half built. The
 * media series are therefore restated there, and this is what stops the two
 * lists drifting.
 */
describe('media series names', () => {
  it('names the same series the media instruments create', () => {
    const declared = new Set<string>(Object.values(METRIC_NAME));
    for (const series of Object.values(MEDIA_METRIC_NAME)) {
      expect(declared.has(series), `${series} is recorded but not declared in METRIC_NAME`).toBe(
        true,
      );
    }
  });

  it('declares no media series no instrument creates', () => {
    const recorded = new Set<string>(Object.values(MEDIA_METRIC_NAME));
    const declaredMedia = Object.values(METRIC_NAME).filter((name) =>
      name.startsWith('agi.media.'),
    );
    expect(declaredMedia).toHaveLength(recorded.size);
    for (const series of declaredMedia) {
      expect(recorded.has(series), `${series} is declared but nothing records it`).toBe(true);
    }
  });
});
