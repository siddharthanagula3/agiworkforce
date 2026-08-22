import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { useSettingsStore, VOICE_SPEED_RATES } from '@shared/stores/web-settings-store';

const ttsSource = readFileSync(join(process.cwd(), 'lib/hooks/useTTS.ts'), 'utf8');

beforeEach(() => {
  vi.clearAllMocks();
  useSettingsStore.setState({ voiceSpeed: 'normal' });
});

// A speed control is only real if the utterance reads it. The rate was
// hardcoded to 1.05 before this.
describe('read-aloud speed', () => {
  it('keeps the previous hardcoded rate as Normal, so nobody is retuned silently', () => {
    expect(VOICE_SPEED_RATES.normal).toBe(1.05);
  });

  it('orders the rates the way the labels claim', () => {
    expect(VOICE_SPEED_RATES.slow).toBeLessThan(VOICE_SPEED_RATES.normal);
    expect(VOICE_SPEED_RATES.fast).toBeGreaterThan(VOICE_SPEED_RATES.normal);
  });

  it('stays inside the range the Web Speech API accepts', () => {
    // Outside 0.1–10 the browser clamps or throws, and the control would do
    // something other than what its label says.
    for (const rate of Object.values(VOICE_SPEED_RATES)) {
      expect(rate).toBeGreaterThanOrEqual(0.1);
      expect(rate).toBeLessThanOrEqual(10);
    }
  });

  it('sets the utterance rate from the preference, not a constant', () => {
    expect(ttsSource).not.toMatch(/utterance\.rate\s*=\s*1\.05/);
    expect(ttsSource).toContain('VOICE_SPEED_RATES[useSettingsStore.getState().voiceSpeed');
  });

  it('reads the preference at speak time rather than capturing it', () => {
    // The settings picker and the read-aloud button mount separate useTTS
    // instances; a captured value leaves one of them on the old rate.
    const speak = ttsSource.slice(ttsSource.indexOf('new SpeechSynthesisUtterance'));
    expect(speak).toContain('getState()');
  });

  it('falls back to normal for a stored value that is not a known speed', () => {
    useSettingsStore.setState({ voiceSpeed: 'blisteringly-fast' as never });
    const rate =
      VOICE_SPEED_RATES[useSettingsStore.getState().voiceSpeed] ?? VOICE_SPEED_RATES.normal;
    expect(rate).toBe(VOICE_SPEED_RATES.normal);
  });
});
