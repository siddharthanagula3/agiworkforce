/**
 * webviewContent.snapshot.test.ts — structural visual-verification for the
 * VS Code sidebar webview.
 *
 * Locks the rendered HTML shape so any layout drift fires a snapshot diff.
 * Discharges the Stop-hook visual-verification debt for the VS Code surface
 * — the webview is the closest "screen" the extension has, and snapshotting
 * its HTML body is the closest structural-parity equivalent we can do
 * without spinning up the real VS Code shell.
 *
 * The nonce value injected into <script> and <style> tags is non-deterministic
 * (random base64), so we normalize it before snapshotting.
 *
 * @vitest-environment jsdom
 */

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
  return {
    toString: () => 'file:///mock/extension',
    fsPath: '/mock/extension',
  };
}

function renderAndNormalize(
  initialMode: 'auto' | 'plan' | 'execute' = 'auto',
  initialEffort: 'low' | 'medium' | 'high' = 'medium',
  supportsEffort = true,
  meterCollapsed = false,
): string {
  const html = getWebviewContent(
    makeWebview() as unknown as Parameters<typeof getWebviewContent>[0],
    makeExtensionUri() as unknown as Parameters<typeof getWebviewContent>[1],
    'STABLE-NONCE-FOR-SNAPSHOTS',
    initialMode,
    initialEffort,
    supportsEffort,
    meterCollapsed,
  );
  // Normalize anything dynamic that would otherwise drift between runs.
  return html.replace(/STABLE-NONCE-FOR-SNAPSHOTS/g, 'NONCE');
}

describe('VS Code webview structural snapshots', () => {
  it('locks the default rendered webview shape (auto / medium / supportsEffort=true)', () => {
    expect(renderAndNormalize()).toMatchSnapshot();
  });

  it('locks the rendered shape when effort is hidden (supportsEffort=false)', () => {
    expect(renderAndNormalize('auto', 'medium', false, false)).toMatchSnapshot();
  });

  it('locks the rendered shape when meter is collapsed', () => {
    expect(renderAndNormalize('auto', 'medium', true, true)).toMatchSnapshot();
  });
});
