import { describe, expect, it } from 'vitest';

import {
  appearanceDelta,
  fromAppearanceNamespace,
  readStoredLocale,
  toAppearanceNamespace,
  type AppearanceSettings,
} from '@/features/settings/lib/appearance-namespace';

const WEB_DEFAULTS: AppearanceSettings = {
  theme: 'system',
  accentColor: 'default',
  chatFont: 'default',
  chatTextSize: 'default',
  motion: 'system',
  highContrast: false,
  codeBlockWrap: false,
  dictationEnabled: true,
  voiceSpeed: 'normal',
  hiddenNavIds: [],
};

describe('the appearance namespace web and mobile share', () => {
  it('writes the three keys mobile already reads, under mobile spellings', () => {
    const projected = toAppearanceNamespace({
      ...WEB_DEFAULTS,
      theme: 'dark',
      accentColor: 'violet',
      chatFont: 'sans',
    });

    expect(projected.theme).toBe('dark');
    expect(projected.accentColor).toBe('violet');
    expect(projected.font).toBe('system');
  });

  it('calls the AGI amber accent what mobile calls it, in both directions', () => {
    expect(toAppearanceNamespace(WEB_DEFAULTS).accentColor).toBe('amber');
    expect(fromAppearanceNamespace({ accentColor: 'amber' }).accentColor).toBe('default');
  });

  it('leaves the accent alone when the phone holds a value web cannot render', () => {
    expect(fromAppearanceNamespace({ accentColor: 'neutral' }).accentColor).toBeUndefined();
  });

  it('round-trips every web value through the shared keys', () => {
    const settings: AppearanceSettings = {
      theme: 'light',
      accentColor: 'rose',
      chatFont: 'dyslexic',
      chatTextSize: 'large',
      motion: 'reduced',
      highContrast: true,
      codeBlockWrap: true,
      dictationEnabled: false,
      voiceSpeed: 'fast',
      hiddenNavIds: ['projects'],
    };

    expect(fromAppearanceNamespace(toAppearanceNamespace(settings))).toEqual(settings);
  });

  it('ignores stored values outside each control’s options', () => {
    expect(
      fromAppearanceNamespace({
        theme: 'sepia',
        textSize: 'enormous',
        motion: 'full',
        voiceSpeed: 9,
        highContrast: 'yes',
        hiddenNavIds: [1, 2],
        font: 'comic',
      }),
    ).toEqual({});
  });

  it('reads nothing out of a namespace that is missing or malformed', () => {
    expect(fromAppearanceNamespace(undefined)).toEqual({});
    expect(fromAppearanceNamespace([])).toEqual({});
    expect(fromAppearanceNamespace('appearance')).toEqual({});
  });

  it('sends only the keys that changed once the account has been read', () => {
    const acknowledged = toAppearanceNamespace(WEB_DEFAULTS);
    const next = toAppearanceNamespace({ ...WEB_DEFAULTS, chatTextSize: 'large' });

    expect(appearanceDelta(acknowledged, next)).toEqual({ textSize: 'large' });
    expect(appearanceDelta(acknowledged, acknowledged)).toBeNull();
  });

  it('notices a hidden sidebar item changing without a length change', () => {
    const acknowledged = toAppearanceNamespace({ ...WEB_DEFAULTS, hiddenNavIds: ['projects'] });
    const next = toAppearanceNamespace({ ...WEB_DEFAULTS, hiddenNavIds: ['schedules'] });

    expect(appearanceDelta(acknowledged, next)).toEqual({ hiddenNavIds: ['schedules'] });
  });

  it('seeds the whole projection into an account that has none', () => {
    expect(appearanceDelta(null, toAppearanceNamespace(WEB_DEFAULTS))).toEqual(
      toAppearanceNamespace(WEB_DEFAULTS),
    );
  });
});

describe('the language namespace', () => {
  it('accepts only a locale the product actually ships', () => {
    expect(readStoredLocale({ locale: 'fr' }, ['en', 'fr'])).toBe('fr');
    expect(readStoredLocale({ locale: 'xx' }, ['en', 'fr'])).toBeNull();
    expect(readStoredLocale({ locale: 7 }, ['en', 'fr'])).toBeNull();
    expect(readStoredLocale({}, ['en', 'fr'])).toBeNull();
    expect(readStoredLocale(null, ['en', 'fr'])).toBeNull();
  });
});
