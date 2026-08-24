import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import i18next from 'i18next';
import ruChat from '../../../../i18n/locales/ru/chat.json' with { type: 'json' };
import { ConversationStatsPanel } from '../ConversationStatsPanel';

// WEB-CORE-CHAT-UI-NOT-LOCALISED-01 slice 2: stats.* keys carried an inline
// English default with no catalogue entry in any locale, so a Russian user
// saw English chrome. This renders against the real ru/chat.json bundle (not
// a synthetic fixture) to prove the catalogue entry is what resolves, not
// the inline default.
afterEach(() => {
  cleanup();
});

describe('ConversationStatsPanel resolves stats.* keys from the real catalogue', () => {
  beforeAll(async () => {
    await i18next.init({
      lng: 'ru',
      fallbackLng: false,
      supportedLngs: ['ru'],
      nonExplicitSupportedLngs: false,
      ns: ['chat'],
      defaultNS: 'chat',
      interpolation: { escapeValue: false },
      resources: { ru: { chat: ruChat } },
    });
  });

  it('renders the Russian stats.noTurns translation, not the English default', async () => {
    await i18next.changeLanguage('ru');
    render(<ConversationStatsPanel messages={[]} />);

    expect(screen.getByText('Пока нет ответов, поэтому токены не были учтены.')).toBeTruthy();
    expect(screen.queryByText('No replies yet, so no tokens have been reported.')).toBeNull();
    expect(screen.getByText('Использование токенов')).toBeTruthy();
  });
});
