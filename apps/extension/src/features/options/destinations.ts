import { t } from '../../i18n';
import { agiWebUrl } from '../../lib/webOrigin';
import { el } from '../side-panel/dom';
import {
  browserKeyboardShortcutDependencies,
  createKeyboardShortcutRows,
} from './keyboard-shortcut-rows';
import { createDesktopPairingRows } from './desktop-pairing-rows';
import { createMicrophoneRow } from './microphone-section';
import { createNotificationsRow } from './notifications-row';
import { createDictationLanguageRow, createInPageAssistantRow } from './preference-rows';
import { createReadAloudRow, type ReadAloudStorage } from './read-aloud-row';
import type { NotificationsStorage } from './notifications-row';
import type { PreferenceStorage } from './preference-rows';

export interface OptionsDestination {
  label: string;
  target: string;
  sections?: string[];
}

export function optionsDestinations(): OptionsDestination[] {
  return [
    { label: t('optNavPermissions'), target: 'opt-permissions' },
    { label: t('optNavShortcuts'), target: 'opt-shortcuts' },
    {
      label: t('optNavOptions'),
      target: 'opt-options',
      sections: ['opt-options', 'opt-keyboard', 'opt-appearance'],
    },
    {
      label: t('optNavAccount'),
      target: 'opt-account',
      sections: [
        'opt-account',
        'opt-account-links',
        'opt-desktop',
        'opt-privacy',
        'opt-preferences',
        'opt-cloud-auth',
      ],
    },
    { label: t('optNavHelp'), target: 'opt-help' },
  ];
}

function section(id: string, title: string): HTMLElement {
  const element = el('section', { class: 'opt-section', id });
  const header = el('div', { class: 'opt-section-header' });
  header.appendChild(el('h2', { class: 'opt-section-title' }, title));
  element.appendChild(header);
  return element;
}

export type OptionsStorage = NotificationsStorage & PreferenceStorage & ReadAloudStorage;

export function createOptionsSection(storage: OptionsStorage): HTMLElement {
  const element = section('opt-options', t('optNavOptions'));
  element.append(
    createNotificationsRow(storage).element,
    createMicrophoneRow().element,
    createReadAloudRow(storage).element,
    createDictationLanguageRow().element,
    createInPageAssistantRow(storage).element,
  );
  return element;
}

export function createKeyboardSection(): HTMLElement {
  const element = section('opt-keyboard', t('optKeyboardTitle'));
  element.appendChild(createKeyboardShortcutRows(browserKeyboardShortcutDependencies()).element);
  return element;
}

export function createAccountLinksSection(): HTMLElement {
  const element = section('opt-account-links', t('optAccountLinksTitle'));
  const links: Array<{ label: string; hint: string; path: string }> = [
    { label: t('optAccountPlan'), hint: t('optAccountPlanHint'), path: '/settings/usage' },
    { label: t('optAccountMemory'), hint: t('optAccountMemoryHint'), path: '/settings/memory' },
  ];
  for (const link of links) {
    const row = el('div', { class: 'opt-row' });
    row.appendChild(
      el(
        'div',
        {},
        el('div', { class: 'opt-row-label' }, link.label),
        el('div', { class: 'opt-row-hint' }, link.hint),
      ),
    );
    row.appendChild(
      el(
        'a',
        {
          class: 'opt-link',
          href: agiWebUrl(`${link.path}?from=chrome-extension`),
          target: '_blank',
          rel: 'noreferrer noopener',
        },
        t('optOpen'),
      ),
    );
    element.appendChild(row);
  }
  return element;
}

export function createDesktopSection(): HTMLElement {
  const element = section('opt-desktop', t('optDesktopTitle'));
  element.appendChild(createDesktopPairingRows().element);
  return element;
}
