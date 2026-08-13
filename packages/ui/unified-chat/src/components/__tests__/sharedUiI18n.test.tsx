/**
 * The shared UI packages must actually translate.
 *
 * `@agiworkforce/ui` and `@agiworkforce/unified-chat` render the chat surface
 * for web and desktop, and every string in them used to be a literal, so
 * switching language translated the host chrome and left the product itself in
 * English. These tests pin the two halves of the contract:
 *
 *   1. With the host i18next singleton initialized, shared components render the
 *      host's locale — not English.
 *   2. With no instance attached, they render the English source copy — never
 *      a raw key and never a raw `{{placeholder}}`.
 *
 * TOPOLOGY THIS EXERCISES. Every host initializes the workspace `i18next`
 * singleton. Shared UI binds to it explicitly because pnpm may install separate
 * React Native and DOM react-i18next peer variants whose contexts do not cross.
 */
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import i18next from 'i18next';
import { Sidebar } from '@agiworkforce/ui';

import { SendButton } from '../SendButton';

afterEach(() => {
  cleanup();
});

/** A locale whose values are unmistakably not the English source copy. */
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
    // A raw key leaking through is the failure mode this fallback exists for.
    expect(screen.queryByText('sidebar.noConversations')).toBeNull();
  });

  it('still interpolates placeholders when the locale has no translation', async () => {
    await i18next.changeLanguage('zz');
    render(<SendButton mode="send" hasContent onClick={() => {}} sendShortcutLabel="Enter" />);

    expect(screen.getByRole('button', { name: 'Send message (Enter)' })).toBeTruthy();
  });
});
