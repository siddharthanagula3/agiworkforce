import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import i18next from 'i18next';
import deChat from '../../../../i18n/locales/de/chat.json' with { type: 'json' };
import { SendButton } from '../SendButton';

// WEB-CORE-CHAT-UI-NOT-LOCALISED-01 slice 1: composer.* keys carried an inline
// English default with no catalogue entry in any locale, so a German user saw
// English chrome. This renders against the real de/chat.json bundle (not a
// synthetic fixture) to prove the catalogue entry is what resolves, not the
// inline default.
afterEach(() => {
  cleanup();
});

describe('SendButton resolves composer.* keys from the real catalogue', () => {
  beforeAll(async () => {
    await i18next.init({
      lng: 'de',
      fallbackLng: false,
      supportedLngs: ['de'],
      nonExplicitSupportedLngs: false,
      ns: ['chat'],
      defaultNS: 'chat',
      interpolation: { escapeValue: false },
      resources: { de: { chat: deChat } },
    });
  });

  it('renders the German composer.stopCurrentResponse translation, not the English default', async () => {
    await i18next.changeLanguage('de');
    render(<SendButton mode="stop" onClick={() => {}} />);

    expect(screen.getByRole('button', { name: 'Aktuelle Antwort stoppen' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop the current response' })).toBeNull();
  });
});
