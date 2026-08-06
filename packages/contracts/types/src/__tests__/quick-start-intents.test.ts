import { describe, expect, it } from 'vitest';
import {
  QUICK_START_INTENTS,
  QUICK_START_INTENT_COPY,
  availableQuickStartIntents,
  quickStartIntentLabel,
  quickStartIntentPrompt,
} from '../quick-start-intents';

describe('quick-start intents', () => {
  it('defines copy for every intent in the presentation order', () => {
    expect([...QUICK_START_INTENTS].sort()).toEqual(Object.keys(QUICK_START_INTENT_COPY).sort());
  });

  it('leads with the two intents both surfaces already agreed on', () => {
    expect(QUICK_START_INTENTS[0]).toBe('code');
    expect(QUICK_START_INTENTS[1]).toBe('write');
  });

  it('gives prefill surfaces a stem the user continues typing after', () => {
    // A stem that does not end in a space forces the user to add one, and reads
    // as a completed sentence when it is not.
    for (const intent of QUICK_START_INTENTS) {
      expect(quickStartIntentPrompt(intent).endsWith(' ')).toBe(true);
    }
  });

  it('keeps labels short enough for a chip row', () => {
    for (const intent of QUICK_START_INTENTS) {
      expect(quickStartIntentLabel(intent).length).toBeLessThanOrEqual(10);
    }
  });

  it('never advertises an intent the surface cannot honour', () => {
    // A chip leading straight to a refusal is the failure this vocabulary exists
    // to prevent, so callers filter by what they actually support.
    const withoutMedia = availableQuickStartIntents({ image: false, video: false });
    expect(withoutMedia).not.toContain('image');
    expect(withoutMedia).not.toContain('video');
    expect(withoutMedia).toContain('code');
  });

  it('preserves order when filtering', () => {
    expect(availableQuickStartIntents({ write: false })).toEqual([
      'code',
      'research',
      'image',
      'video',
      'computer',
    ]);
  });

  it('offers everything when nothing is declared unsupported', () => {
    expect(availableQuickStartIntents()).toEqual(QUICK_START_INTENTS);
  });
});
