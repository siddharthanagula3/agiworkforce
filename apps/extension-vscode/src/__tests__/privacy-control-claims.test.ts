/**
 * privacy-control-claims.test.ts — the VS Code surface must not advertise a
 * privacy control that does not exist.
 *
 * `/settings/privacy` (the page both of these entry points open) offers a
 * telemetry-sharing toggle, bulk chat archive/delete, data export, and account
 * deletion. It has no retention-period setting, and it deliberately has no
 * model-training control: AGI does not train AGI-owned models on customer
 * prompts, responses, or files, so there is no data path to opt into. Web
 * (PrivacySection.training.test.tsx) and Mobile (model-training-policy.test.tsx)
 * already guard their own copy; the VS Code entry points labelled the same page
 * "Retention & training controls" / "Retention & training settings", which
 * promised a user two controls they could never find.
 *
 * Both call sites are user-reachable: the QuickPick row via the
 * `agi-workforce.showAccountUsage` command (core/commandSetup.ts), and the
 * onboarding button via the sidebar webview, whose click posts
 * `openPrivacySettings` to ChatStateManager.
 *
 * @vitest-environment jsdom
 */

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
