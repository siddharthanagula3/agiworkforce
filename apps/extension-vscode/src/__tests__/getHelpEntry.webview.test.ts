/**
 * The extension had no Get Help affordance at all. These pin the two places it
 * now lives and the handler behind them.
 *
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

function makeWebview() {
  return {
    cspSource: 'vscode-webview://mock',
    asWebviewUri: (uri: { toString(): string }) => ({
      toString: () => uri.toString().replace(/^file:/, 'https://mock'),
    }),
  };
}

function makeExtensionUri() {
  return { toString: () => 'file:///mock/extension', fsPath: '/mock/extension' };
}

function render(): string {
  return getWebviewContent(
    makeWebview() as unknown as Parameters<typeof getWebviewContent>[0],
    makeExtensionUri() as unknown as Parameters<typeof getWebviewContent>[1],
    'test-nonce-base64url-32-chars-abcdef',
    'auto',
    'medium',
    true,
    false,
  );
}

const chatStateManagerSource = readFileSync(
  resolve(process.cwd(), 'src/features/sidebar-webview/ChatStateManager.ts'),
  'utf8',
);

describe('Get help in the VS Code sidebar', () => {
  it('offers help on first run, where a new reader is', () => {
    const doc = new DOMParser().parseFromString(render(), 'text/html');
    const button = doc.getElementById('onboardingGetHelp');
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe('Get help');
    expect(button?.getAttribute('type')).toBe('button');
  });

  it('offers help from the runtime failure banner, where a stuck reader is', () => {
    const doc = new DOMParser().parseFromString(render(), 'text/html');
    const button = doc.getElementById('runtimeHelpBtn');
    expect(button).not.toBeNull();
    expect(button?.textContent).toBe('Get help');
    expect(button?.className).toContain('runtime-status-secondary');
  });

  it('posts one message for both, rather than two divergent handlers', () => {
    const html = render();
    const occurrences = html.match(/postMessage\(\{ type: 'openHelp' \}\)/g) ?? [];
    expect(occurrences.length).toBe(2);
  });

  it('opens the help centre externally and names the surface it came from', () => {
    expect(chatStateManagerSource).toContain("case 'openHelp':");
    expect(chatStateManagerSource).toContain(
      "vscode.Uri.parse('https://agiworkforce.com/help?from=vscode-extension')",
    );
    expect(chatStateManagerSource).toContain("| { type: 'openHelp' }");
  });
});
