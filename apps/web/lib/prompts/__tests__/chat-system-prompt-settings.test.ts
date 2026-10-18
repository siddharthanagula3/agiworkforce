import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  settingsGuidanceFor,
  type PreambleSurface,
} from '@/app/api/llm/v1/chat/completions/lib/capability-preamble';
import {
  HOSTED_SETTINGS_NAV_GROUPS,
  WEB_SETTINGS_NAV_GROUPS,
} from '@/features/settings/components/web-settings-navigation';

import {
  CHAT_SYSTEM_PROMPT_PINNED_VERSION,
  CHAT_SYSTEM_PROMPT_VERSIONS,
  chatSystemPromptSections,
} from '../chat-system-prompt';

const APPS_DIR = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const MOBILE_SETTINGS_FILE = path.join(
  APPS_DIR,
  'mobile',
  'src',
  'features',
  'settings',
  'index.tsx',
);
const EXTENSION_OPTIONS_FILE = path.join(
  APPS_DIR,
  'extension',
  'src',
  'features',
  'options',
  'destinations.ts',
);
const EXTENSION_MESSAGES_FILE = path.join(APPS_DIR, 'extension', '_locales', 'en', 'messages.json');

type SettingsMenu = 'web' | 'desktop' | 'mobile' | 'chrome';

const SECTION_LABELS: Readonly<Record<string, readonly string[]>> = {
  settings_help_web: [
    'Memory',
    'General',
    'Connectors',
    'Skills',
    'Plugins',
    'Capabilities',
    'Privacy',
  ],
  account_help_web: ['Usage', 'Billing', 'Help'],
  settings_help_account: ['Memory', 'General', 'Connectors', 'Privacy'],
  account_help_account: ['Usage', 'Billing', 'Help'],
  settings_help_mobile: ['Memory', 'Personalization', 'Connectors', 'Capabilities', 'Privacy'],
  account_help_mobile: ['Usage', 'Subscription', 'Help Center'],
};

const OWN_SETTINGS_MENU: Readonly<Record<PreambleSurface, SettingsMenu | null>> = {
  web: 'web',
  desktop: 'desktop',
  mobile: 'mobile',
  chrome: 'chrome',
  vscode: null,
  cli: null,
  unknown: null,
  slack: null,
  scheduled: null,
};

interface MenuItem {
  readonly group: string | undefined;
  readonly label: string;
}

function navItems(groups: typeof WEB_SETTINGS_NAV_GROUPS): MenuItem[] {
  return groups.flatMap((group) =>
    group.items.map((item) => ({ group: group.label, label: item.label })),
  );
}

function sourceItems(file: string, pattern: RegExp): MenuItem[] {
  return [...readFileSync(file, 'utf8').matchAll(pattern)].map((match) => ({
    group: undefined,
    label: match[1] ?? '',
  }));
}

function extensionItems(file: string, messagesFile: string): MenuItem[] {
  const messages = JSON.parse(readFileSync(messagesFile, 'utf8')) as Record<
    string,
    { message: string }
  >;
  return sourceItems(file, /\{\s*label:\s*t\('([^']+)'\),\s*target:\s*'opt-/gu).map((item) => ({
    group: undefined,
    label: messages[item.label]?.message ?? item.label,
  }));
}

const MENU_ITEMS: Readonly<Record<SettingsMenu, readonly MenuItem[]>> = {
  web: navItems(WEB_SETTINGS_NAV_GROUPS),
  desktop: navItems(HOSTED_SETTINGS_NAV_GROUPS),
  mobile: sourceItems(MOBILE_SETTINGS_FILE, /\blabel:\s*'([^']+)'/gu),
  chrome: extensionItems(EXTENSION_OPTIONS_FILE, EXTENSION_MESSAGES_FILE),
};

const MENU_LABELS: Readonly<Record<SettingsMenu, readonly string[]>> = {
  web: MENU_ITEMS.web.map((item) => item.label),
  desktop: MENU_ITEMS.desktop.map((item) => item.label),
  mobile: MENU_ITEMS.mobile.map((item) => item.label),
  chrome: MENU_ITEMS.chrome.map((item) => item.label),
};

const KNOWN_LABEL: Readonly<Record<SettingsMenu, string>> = {
  web: 'Memory',
  desktop: 'Memory',
  mobile: 'Memory',
  chrome: 'Permissions',
};

const SERVABLE_VERSIONS = [
  ...new Set([
    CHAT_SYSTEM_PROMPT_PINNED_VERSION,
    Math.max(...CHAT_SYSTEM_PROMPT_VERSIONS.map((entry) => entry.version)),
  ]),
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function menuNamedBy(surface: PreambleSurface): SettingsMenu {
  if (settingsGuidanceFor(surface) === 'account') return 'web';
  const menu = OWN_SETTINGS_MENU[surface];
  if (!menu) throw new Error(`${surface} has no Settings of its own to send the user to`);
  return menu;
}

describe('Settings sections the chat system prompt names', () => {
  it.each(Object.keys(MENU_LABELS) as SettingsMenu[])('reads the %s Settings menu', (menu) => {
    expect(MENU_LABELS[menu]).toContain(KNOWN_LABEL[menu]);
  });

  it.each(SERVABLE_VERSIONS)(
    'v%i, pinned or next to pin, names each section it lists',
    (version) => {
      const sections = chatSystemPromptSections(version);
      for (const [key, labels] of Object.entries(SECTION_LABELS)) {
        const text = sections[key];
        if (text === undefined) continue;
        for (const label of labels) {
          expect(text, `${key} names ${label}`).toMatch(
            new RegExp(`\\b${escapeRegExp(label)}\\b`, 'u'),
          );
        }
      }
    },
  );

  it.each(Object.keys(OWN_SETTINGS_MENU) as PreambleSurface[])(
    'sends %s users only to sections the Settings they are told to open holds',
    (surface) => {
      const guidance = settingsGuidanceFor(surface);
      const menu = menuNamedBy(surface);
      for (const key of [`settings_help_${guidance}`, `account_help_${guidance}`]) {
        for (const label of SECTION_LABELS[key] ?? []) {
          expect(MENU_LABELS[menu], `${surface} is sent to ${label} by ${key}`).toContain(label);
        }
      }
    },
  );

  it.each(Object.keys(OWN_SETTINGS_MENU) as PreambleSurface[])(
    'names the group of any section %s users would otherwise find twice',
    (surface) => {
      const guidance = settingsGuidanceFor(surface);
      const menu = menuNamedBy(surface);
      for (const version of SERVABLE_VERSIONS) {
        const sections = chatSystemPromptSections(version);
        for (const key of [`settings_help_${guidance}`, `account_help_${guidance}`]) {
          const text = sections[key];
          if (text === undefined) continue;
          for (const label of SECTION_LABELS[key] ?? []) {
            const groups = MENU_ITEMS[menu]
              .filter((item) => item.label === label)
              .map((item) => item.group);
            if (groups.length < 2) continue;
            expect(
              groups.some(
                (group) => group !== undefined && text.includes(`${label} under ${group}`),
              ),
              `v${version} ${key} sends ${surface} users to ${label}, which ${menu} Settings lists ${groups.length} times`,
            ).toBe(true);
          }
        }
      }
    },
  );

  it('names the web app wherever it sends the user to Settings outside their own app', () => {
    const latest = chatSystemPromptSections(
      Math.max(...CHAT_SYSTEM_PROMPT_VERSIONS.map((entry) => entry.version)),
    );

    expect(latest['settings_help_account']).toContain('in Settings in the AGI Workforce web app');
    expect(latest['account_help_account']).toContain('in Settings in the AGI Workforce web app');
  });
});
