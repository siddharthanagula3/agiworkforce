import { describe, expect, it } from 'vitest';
import { IME_PROCESSING_KEY_CODE, isImeComposingKey } from '../ime-composition';

describe('isImeComposingKey', () => {
  it('reports composition when the event says so', () => {
    expect(isImeComposingKey({ isComposing: true, keyCode: 13 })).toBe(true);
  });

  it('reports composition when only the processing keycode is set', () => {
    expect(isImeComposingKey({ isComposing: false, keyCode: IME_PROCESSING_KEY_CODE })).toBe(true);
  });

  it('reports composition when the keycode is the sole signal present', () => {
    expect(isImeComposingKey({ keyCode: IME_PROCESSING_KEY_CODE })).toBe(true);
  });

  it('does not report composition for an ordinary Enter', () => {
    expect(isImeComposingKey({ isComposing: false, keyCode: 13 })).toBe(false);
  });

  it('does not report composition when neither signal is present', () => {
    expect(isImeComposingKey({})).toBe(false);
  });
});
