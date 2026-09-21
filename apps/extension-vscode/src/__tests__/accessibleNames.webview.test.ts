/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';
import { getSettingsWebviewContent } from '../features/settings/settingsWebviewContent';
import { Config } from '../platform/config';

const WEBVIEW = {
  cspSource: 'vscode-webview://mock',
  asWebviewUri: (uri: { toString(): string }) => ({ toString: () => uri.toString() }),
} as never;
const EXTENSION_URI = {
  toString: () => 'file:///mock/extension',
  fsPath: '/mock/extension',
} as never;

const INTERACTIVE = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="listbox"]',
  '[role="menu"]',
  '[role="dialog"]',
].join(',');

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** The name a screen reader would read, by the rules VS Code's webviews follow. */
function accessibleName(element: Element, document: Document): string {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy !== null) {
    const named = labelledBy
      .split(/\s+/u)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .join(' ')
      .trim();
    if (named !== '') return named;
  }
  const label = element.getAttribute('aria-label')?.trim();
  if (label !== undefined && label !== '') return label;

  const id = element.getAttribute('id');
  if (id !== null) {
    const forLabel = document.querySelector(`label[for="${id}"]`)?.textContent?.trim();
    if (forLabel !== undefined && forLabel !== '') return forLabel;
  }
  if (element.closest('label') !== null) {
    const wrapping = element.closest('label')?.textContent?.trim() ?? '';
    const title = element.closest('label')?.getAttribute('title')?.trim() ?? '';
    if (wrapping !== '') return wrapping;
    if (title !== '') return title;
  }

  const text = element.textContent?.trim() ?? '';
  if (text !== '') return text;

  const title = element.getAttribute('title')?.trim();
  if (title !== undefined && title !== '') return title;

  const placeholder = element.getAttribute('placeholder')?.trim();
  if (placeholder !== undefined && placeholder !== '') return placeholder;

  return '';
}

function unnamedControls(html: string): string[] {
  const document = parse(html);
  return [...document.querySelectorAll(INTERACTIVE)]
    .filter((element) => element.getAttribute('aria-hidden') !== 'true')
    .filter((element) => element.getAttribute('type') !== 'hidden')
    .filter((element) => accessibleName(element, document) === '')
    .map((element) => {
      const id = element.getAttribute('id');
      const cls = element.getAttribute('class');
      return `${element.tagName.toLowerCase()}${id === null ? '' : `#${id}`}${cls === null ? '' : `.${cls.split(/\s+/u)[0]}`}`;
    });
}

describe('every control the chat webview renders announces itself', () => {
  it('names each control in the default sidebar', () => {
    expect(
      unnamedControls(
        getWebviewContent(
          WEBVIEW,
          EXTENSION_URI,
          'test-nonce-base64url-32-chars-abcdef',
          'auto',
          'medium',
          true,
          false,
          'pro',
        ),
      ),
    ).toEqual([]);
  });

  it('names each control while onboarding is showing', () => {
    expect(
      unnamedControls(
        getWebviewContent(
          WEBVIEW,
          EXTENSION_URI,
          'test-nonce-base64url-32-chars-abcdef',
          'plan',
          'high',
          false,
          true,
          'free',
          true,
        ),
      ),
    ).toEqual([]);
  });

  it('names each control in the settings panel', () => {
    const state = {
      ...Config.settingsSnapshot(),
      accountConnected: false,
      accountStatus: 'signed-out',
      agentConfigPath: '/host/.agiworkforce/config.toml',
    };
    expect(
      unnamedControls(
        getSettingsWebviewContent(WEBVIEW, 'settings-test-nonce', state as never, 'general'),
      ),
    ).toEqual([]);
  });
});
