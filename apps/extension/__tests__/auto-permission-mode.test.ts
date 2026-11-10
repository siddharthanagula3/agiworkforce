import { describe, expect, it, vi } from 'vitest';

import { approvalRequirement } from '../src/features/computer-use/approvalPolicy';
import {
  actionNeedsApproval,
  type BrowserPermissionMode,
} from '../src/features/computer-use/askBeforeActing';
import {
  crucialActionCategory,
  isCrucialAction,
} from '../src/features/computer-use/crucialActions';

const PAGE = 'https://shop.example/cart';

function button(label: string): string {
  return `button|button|submit||${label}`;
}

function asks(
  mode: BrowserPermissionMode,
  input: Parameters<typeof approvalRequirement>[0],
  siteApproved = false,
): Promise<boolean> {
  const requirement = approvalRequirement(input);
  return actionNeedsApproval({
    alwaysAsk: requirement.alwaysAsk,
    crucial: isCrucialAction(requirement),
    mode,
    allowedForTask: false,
    readsOnly: false,
    siteApproved: vi.fn(async () => siteApproved),
  });
}

describe('Auto acts without asking and stops for crucial actions', () => {
  it('navigates, clicks, types and reloads without asking', async () => {
    await expect(
      asks('auto', {
        toolName: 'navigate',
        args: { url: 'https://en.wikipedia.org/wiki/Hobart' },
        pageUrl: PAGE,
      }),
    ).resolves.toBe(false);
    await expect(
      asks('auto', {
        toolName: 'click',
        args: { index: 3 },
        pageUrl: PAGE,
        targetSignature: 'a|link|||Climate',
      }),
    ).resolves.toBe(false);
    await expect(
      asks('auto', {
        toolName: 'type',
        args: { index: 1, text: 'Hobart' },
        pageUrl: PAGE,
        targetSignature: 'input||search|q|Search',
      }),
    ).resolves.toBe(false);
    await expect(asks('auto', { toolName: 'reload', args: {}, pageUrl: PAGE })).resolves.toBe(
      false,
    );
    await expect(
      asks('auto', {
        toolName: 'select_option',
        args: { index: 2, matchBy: 'value', option: 'M' },
        pageUrl: PAGE,
      }),
    ).resolves.toBe(false);
  });

  it.each([
    ['buying', button('Place order'), 'money'],
    ['paying', button('Pay now'), 'money'],
    ['sending', button('Send'), 'speaking_for_user'],
    ['posting', button('Post'), 'speaking_for_user'],
    ['submitting a form', button('Submit application'), 'speaking_for_user'],
    ['deleting', button('Delete account'), 'speaking_for_user'],
    ['signing in', button('Sign in'), 'secrets'],
    ['granting access', button('Authorize app'), 'speaking_for_user'],
    ['accepting terms', button('I agree to the terms'), 'speaking_for_user'],
  ])('asks before %s', async (_label, targetSignature, category) => {
    const input = { toolName: 'click', args: { index: 7 }, pageUrl: PAGE, targetSignature };
    expect(crucialActionCategory(approvalRequirement(input))).toBe(category);
    await expect(asks('auto', input)).resolves.toBe(true);
  });

  it.each([
    {
      pageUrl: 'https://chase.com/transfer',
      targetSignature: 'select|||account|Destination',
      reason: 'sensitive_site',
    },
    {
      pageUrl: 'https://example.com/settings/permissions',
      targetSignature: 'select|||role|Role',
      reason: 'permission_change',
    },
    {
      pageUrl: PAGE,
      targetSignature: 'select|||memberRole|Member role',
      reason: 'permission_change',
    },
    { pageUrl: PAGE, targetSignature: 'select|||answer|Security code', reason: 'sensitive_input' },
    { pageUrl: PAGE, targetSignature: 'select|||agreement|I agree to the terms', reason: 'terms' },
    {
      pageUrl: 'https://example.com/login',
      targetSignature: 'select|||provider|Provider',
      reason: 'authentication',
    },
  ])(
    'keeps the crucial classification for dropdowns: $reason / $pageUrl',
    async ({ pageUrl, targetSignature, reason }) => {
      const input = {
        toolName: 'select_option',
        args: { index: 2, matchBy: 'value', option: 'choice' },
        pageUrl,
        targetSignature,
      };
      expect(approvalRequirement(input)).toMatchObject({ alwaysAsk: true, reason });
      expect(isCrucialAction(approvalRequirement(input))).toBe(true);
      await expect(asks('auto', input)).resolves.toBe(true);
    },
  );

  it('asks before entering a password or card number and before a download', async () => {
    await expect(
      asks('auto', {
        toolName: 'type',
        args: { index: 2, text: 'hunter2' },
        pageUrl: PAGE,
        targetSignature: 'input||password|pw|Password',
      }),
    ).resolves.toBe(true);
    await expect(
      asks('auto', {
        toolName: 'type',
        args: { index: 4, text: '4111' },
        pageUrl: PAGE,
        targetSignature: 'input||text|cc|Card number',
      }),
    ).resolves.toBe(true);
    await expect(
      asks('auto', {
        toolName: 'download_file',
        args: { url: 'https://shop.example/invoice.pdf' },
        pageUrl: PAGE,
      }),
    ).resolves.toBe(true);
  });

  it.each([
    { toolName: 'open_tab', args: { url: 'https://shop.example/jobs' } },
    { toolName: 'switch_tab', args: { tabId: 7 } },
  ])('lets Full access perform $toolName only on approved sites', async (action) => {
    const input = { ...action, pageUrl: PAGE };
    await expect(asks('full', input, true)).resolves.toBe(false);
    await expect(asks('full', input, false)).resolves.toBe(true);
    await expect(asks('ask', input, true)).resolves.toBe(true);
    await expect(asks('auto', input)).resolves.toBe(false);
  });

  it('keeps approval for closing a tab that can contain unsaved changes', async () => {
    await expect(
      asks('full', { toolName: 'close_tab', args: { tabId: 7 }, pageUrl: PAGE }, true),
    ).resolves.toBe(true);
  });

  it('keeps Ask first asking for everything and Full access on approved sites only', async () => {
    const navigate = {
      toolName: 'navigate',
      args: { url: 'https://en.wikipedia.org/' },
      pageUrl: PAGE,
    };
    await expect(asks('ask', navigate)).resolves.toBe(true);
    await expect(asks('full', navigate, true)).resolves.toBe(false);
    await expect(asks('full', navigate, false)).resolves.toBe(true);
    await expect(asks('full', { toolName: 'reload', args: {}, pageUrl: PAGE }, true)).resolves.toBe(
      true,
    );
  });
});
