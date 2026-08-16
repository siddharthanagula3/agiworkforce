import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import i18next from 'i18next';
import { Sidebar } from '@agiworkforce/ui';

import { SendButton } from '../SendButton';

afterEach(() => {
  cleanup();
});

async function initializeFrenchHost() {
  await i18next.init({
    lng: 'fr',
    fallbackLng: false,
    supportedLngs: ['fr', 'zz'],
    nonExplicitSupportedLngs: false,
    ns: ['chat', 'common'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    resources: {
      fr: {
        chat: {
          newChat: 'Nouvelle discussion',
          sidebar: { chats: 'Discussions', noConversations: 'Aucune conversation' },
          composer: {
            sendWithShortcut: 'Envoyer le message ({{shortcut}})',
            stopCurrentResponse: 'Arrêter la réponse en cours',
          },
        },
        common: { search: 'Rechercher' },
      },
      zz: { chat: {}, common: {} },
    },
  });
}

const sidebarProps = {
  sessions: [],
  onNewChat: () => {},
  onSelect: () => {},
  onRename: () => {},
  onDelete: () => {},
};

describe('shared UI i18n', () => {
  beforeAll(initializeFrenchHost);

  it('renders the host locale in @agiworkforce/ui components', async () => {
    await i18next.changeLanguage('fr');
    render(<Sidebar {...sidebarProps} />);

    expect(screen.getByText('Nouvelle discussion')).toBeTruthy();
    expect(screen.getByText('Rechercher')).toBeTruthy();
    expect(screen.getByText('Aucune conversation')).toBeTruthy();
    expect(screen.queryByText('New Chat')).toBeNull();
  });

  it('renders the host locale in @agiworkforce/unified-chat components', async () => {
    await i18next.changeLanguage('fr');
    render(<SendButton mode="stop" onClick={() => {}} />);

    expect(screen.getByRole('button', { name: 'Arrêter la réponse en cours' })).toBeTruthy();
  });

  it('interpolates placeholders in the host locale', async () => {
    await i18next.changeLanguage('fr');
    render(
      <SendButton mode="send" hasContent onClick={() => {}} sendShortcutLabel="Ctrl+Entrée" />,
    );

    expect(screen.getByRole('button', { name: 'Envoyer le message (Ctrl+Entrée)' })).toBeTruthy();
  });

  it('falls back to English source copy when the locale has no translation', async () => {
    await i18next.changeLanguage('zz');
    render(<Sidebar {...sidebarProps} />);

    expect(screen.getByRole('button', { name: 'New chat' })).toBeTruthy();
    expect(screen.getByText('No conversations yet')).toBeTruthy();
    expect(screen.queryByText('sidebar.noConversations')).toBeNull();
  });

  it('still interpolates placeholders when the locale has no translation', async () => {
    await i18next.changeLanguage('zz');
    render(<SendButton mode="send" hasContent onClick={() => {}} sendShortcutLabel="Enter" />);

    expect(screen.getByRole('button', { name: 'Send message (Enter)' })).toBeTruthy();
  });
});
