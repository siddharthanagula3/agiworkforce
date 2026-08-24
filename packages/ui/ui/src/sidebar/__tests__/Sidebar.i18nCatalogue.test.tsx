import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import i18next from 'i18next';
import frChat from '../../../../i18n/locales/fr/chat.json' with { type: 'json' };
import { Sidebar } from '../Sidebar';

// WEB-CORE-CHAT-UI-NOT-LOCALISED-01 slice 1: sidebar.* keys carried an inline
// English default with no catalogue entry in any locale, so a French user saw
// English chrome. This renders against the real fr/chat.json bundle (not a
// synthetic fixture) to prove the catalogue entry is what resolves, not the
// inline default.
afterEach(() => {
  cleanup();
});

describe('Sidebar resolves sidebar.* keys from the real catalogue', () => {
  beforeAll(async () => {
    await i18next.init({
      lng: 'fr',
      fallbackLng: false,
      supportedLngs: ['fr'],
      nonExplicitSupportedLngs: false,
      ns: ['chat'],
      defaultNS: 'chat',
      interpolation: { escapeValue: false },
      resources: { fr: { chat: frChat } },
    });
  });

  it('renders the French sidebar.startNewChat translation, not the English default', async () => {
    await i18next.changeLanguage('fr');
    render(
      <Sidebar
        sessions={[]}
        onNewChat={() => {}}
        onSelect={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />,
    );

    expect(screen.getByText('Démarrer une nouvelle conversation')).toBeTruthy();
    expect(screen.queryByText('Start a new chat')).toBeNull();
  });
});
