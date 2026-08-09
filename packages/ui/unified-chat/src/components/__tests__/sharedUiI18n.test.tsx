/**
 * The shared UI packages must actually translate.
 *
 * `@agiworkforce/ui` and `@agiworkforce/unified-chat` render the chat surface
 * for web and desktop, and every string in them used to be a literal, so
 * switching language translated the host chrome and left the product itself in
 * English. These tests pin the two halves of the contract:
 *
 *   1. With a host i18next instance attached, shared components render the
 *      host's locale — not English.
 *   2. With no instance attached, they render the English source copy — never
 *      a raw key and never a raw `{{placeholder}}`.
 *
 * TOPOLOGY THIS EXERCISES. `react-i18next` here resolves the same root-hoisted
 * copy that `packages/ui/ui/src/i18n.ts` resolves, so case 1 reproduces
 * desktop and mobile, where the host depends on `react-i18next@^17.0.6` and
 * shares that copy. It does NOT reproduce `apps/web`, which pins `^17.0.1` and
 * therefore loads a second physical copy with its own `I18nContext`; on web
 * case 2 is the only case that ever runs, whatever the locale. See the header
 * of `packages/ui/ui/src/i18n.ts` — deduping that pin is ExecutionPlan #73.
 *
 * The instance is passed through `I18nextProvider` rather than
 * `initReactI18next`, so it stays scoped to these tests instead of becoming
 * react-i18next's global instance.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { Sidebar } from '@agiworkforce/ui';

import { SendButton } from '../SendButton';

afterEach(() => {
  cleanup();
});

/** A locale whose values are unmistakably not the English source copy. */
function frenchInstance() {
  const instance = createInstance();
  void instance.init({
    lng: 'fr',
    fallbackLng: 'fr',
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
    },
  });
  return instance;
}

const sidebarProps = {
  sessions: [],
  onNewChat: () => {},
  onSelect: () => {},
  onRename: () => {},
  onDelete: () => {},
};

describe('shared UI i18n', () => {
  it('renders the host locale in @agiworkforce/ui components', () => {
    render(
      <I18nextProvider i18n={frenchInstance()}>
        <Sidebar {...sidebarProps} />
      </I18nextProvider>,
    );

    expect(screen.getByText('Nouvelle discussion')).toBeTruthy();
    expect(screen.getByText('Rechercher')).toBeTruthy();
    expect(screen.getByText('Aucune conversation')).toBeTruthy();
    expect(screen.queryByText('New Chat')).toBeNull();
  });

  it('renders the host locale in @agiworkforce/unified-chat components', () => {
    render(
      <I18nextProvider i18n={frenchInstance()}>
        <SendButton mode="stop" onClick={() => {}} />
      </I18nextProvider>,
    );

    expect(screen.getByRole('button', { name: 'Arrêter la réponse en cours' })).toBeTruthy();
  });

  it('interpolates placeholders in the host locale', () => {
    render(
      <I18nextProvider i18n={frenchInstance()}>
        <SendButton mode="send" hasContent onClick={() => {}} sendShortcutLabel="Ctrl+Entrée" />
      </I18nextProvider>,
    );

    expect(screen.getByRole('button', { name: 'Envoyer le message (Ctrl+Entrée)' })).toBeTruthy();
  });

  it('falls back to English source copy when no i18next instance is attached', () => {
    render(<Sidebar {...sidebarProps} />);

    expect(screen.getByRole('button', { name: 'New chat' })).toBeTruthy();
    expect(screen.getByText('No conversations yet')).toBeTruthy();
    // A raw key leaking through is the failure mode this fallback exists for.
    expect(screen.queryByText('sidebar.noConversations')).toBeNull();
  });

  it('still interpolates placeholders when no i18next instance is attached', () => {
    render(<SendButton mode="send" hasContent onClick={() => {}} sendShortcutLabel="Enter" />);

    expect(screen.getByRole('button', { name: 'Send message (Enter)' })).toBeTruthy();
  });
});
