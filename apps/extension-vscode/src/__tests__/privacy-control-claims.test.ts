import { describe, expect, it } from 'vitest';

import { buildTrustReviewItems } from '../features/account-auth/accountPresentation';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

const ABSENT_CONTROL = /\btraining\b|\bretention\b/i;

function renderWebview(): string {
  const webview = {
    cspSource: 'vscode-webview://mock',
    asWebviewUri: (uri: { toString(): string }) => ({
      toString: () => uri.toString().replace(/^file:/, 'https://mock'),
    }),
  };
  const extensionUri = {
    toString: () => 'file:///mock/extension',
    fsPath: '/mock/extension',
  };

  return getWebviewContent(
    webview as unknown as Parameters<typeof getWebviewContent>[0],
    extensionUri as unknown as Parameters<typeof getWebviewContent>[1],
    'NONCE',
    'auto',
    'medium',
    true,
    false,
    undefined,
    true,
  );
}

describe('VS Code privacy entry points', () => {
  it('does not offer a training or retention control in the account QuickPick', () => {
    const items = buildTrustReviewItems('auto', {
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      accountType: 'Personal account',
      planName: 'Pro',
      tier: 'pro',
    });

    const privacyItem = items.find((item) => item.action === 'privacy-settings');
    expect(privacyItem).toBeDefined();
    expect(privacyItem?.label).not.toMatch(ABSENT_CONTROL);
    expect(privacyItem?.description ?? '').not.toMatch(ABSENT_CONTROL);
    expect(privacyItem?.detail ?? '').not.toMatch(ABSENT_CONTROL);

    for (const item of items) {
      expect(item.label).not.toMatch(ABSENT_CONTROL);
    }
  });

  it('names the privacy row after controls the linked page actually has', () => {
    const items = buildTrustReviewItems('auto', undefined);
    const privacyItem = items.find((item) => item.action === 'privacy-settings');

    expect(privacyItem?.label).toContain('Privacy & data controls');
    expect(privacyItem?.description).toMatch(/telemetry/i);
  });

  it('does not offer a training or retention control in onboarding', () => {
    document.body.innerHTML = renderWebview();

    const button = document.getElementById('onboardingPrivacySettings');
    expect(button).not.toBeNull();
    expect(button?.textContent ?? '').not.toMatch(ABSENT_CONTROL);
    expect(button?.textContent).toContain('Privacy & data controls');
  });
});
