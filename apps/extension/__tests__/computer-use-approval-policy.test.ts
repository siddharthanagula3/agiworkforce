import { describe, expect, it } from 'vitest';
import {
  alwaysAskRefusal,
  approvalRequirement,
  classifySensitiveSite,
  describeApprovalReason,
} from '../src/features/computer-use/approvalPolicy';

describe('classifySensitiveSite', () => {
  it.each([
    ['https://secure.chase.com/web/auth', 'banking'],
    ['https://www.firstcitizensbank.com', null],
    ['https://online.bank-of-somewhere.com/login', 'banking'],
    ['https://mychart.example-health.org/MyChart', 'health'],
    ['https://www.kp.org/', 'health'],
    ['https://accounts.google.com/o/oauth2/v2/auth', 'identity_provider'],
    ['https://acme.okta.com/app', 'identity_provider'],
    ['https://sso.acme.com/start', 'identity_provider'],
    ['https://my.1password.com/vaults', 'password_manager'],
    ['https://vault.bitwarden.com/#/vault', 'password_manager'],
    ['https://example.com/banking-news', null],
    ['https://notchase.com/', null],
    ['chrome://settings', null],
    ['not a url', null],
  ])('%s is %s', (url, expected) => {
    expect(classifySensitiveSite(url)).toBe(expected);
  });
});

describe('approvalRequirement', () => {
  const plain = 'https://example.com/form';

  it('always asks before a download', () => {
    expect(
      approvalRequirement({ toolName: 'download_file', args: { url: 'x' }, pageUrl: plain }),
    ).toEqual({ alwaysAsk: true, reason: 'download' });
  });

  it('treats a click or type on a file input as an upload', () => {
    expect(
      approvalRequirement({
        toolName: 'click',
        args: { index: 3 },
        pageUrl: plain,
        targetSignature: 'input||file|cv|Upload',
      }),
    ).toEqual({ alwaysAsk: true, reason: 'upload' });
    expect(
      approvalRequirement({
        toolName: 'click',
        args: { selector: 'input[type="file"]' },
        pageUrl: plain,
      }),
    ).toEqual({ alwaysAsk: true, reason: 'upload' });
  });

  it('asks before typing into a password or payment field', () => {
    expect(
      approvalRequirement({
        toolName: 'type',
        args: { index: 1, text: 'hunter2' },
        pageUrl: plain,
        targetSignature: 'input||password|pw|',
      }),
    ).toEqual({ alwaysAsk: true, reason: 'sensitive_input' });
    expect(
      approvalRequirement({
        toolName: 'type',
        args: { index: 2, text: '4242' },
        pageUrl: plain,
        targetSignature: 'input||text|cc|Card number',
      }).reason,
    ).toBe('sensitive_input');
    expect(
      approvalRequirement({
        toolName: 'type',
        args: { index: 2, text: 'Ada' },
        pageUrl: plain,
        targetSignature: 'input||text|first_name|First name',
      }),
    ).toEqual({ alwaysAsk: false });
  });

  it('defaults every acting or reading step on a sensitive site to ask', () => {
    for (const toolName of ['click', 'type', 'scroll', 'read_dom', 'screenshot', 'find']) {
      expect(
        approvalRequirement({ toolName, args: {}, pageUrl: 'https://www.paypal.com/myaccount' }),
      ).toEqual({ alwaysAsk: true, reason: 'sensitive_site', siteClass: 'banking' });
    }
  });

  it('asks before navigating to a sensitive site or an authorization request', () => {
    expect(
      approvalRequirement({
        toolName: 'navigate',
        args: { url: 'https://lastpass.com/vault' },
        pageUrl: plain,
      }),
    ).toEqual({ alwaysAsk: true, reason: 'sensitive_site', siteClass: 'password_manager' });
    expect(
      approvalRequirement({
        toolName: 'navigate',
        args: {
          url: 'https://github.com/login/oauth/authorize?client_id=abc&redirect_uri=https://x.test',
        },
        pageUrl: plain,
      }).reason,
    ).toBe('authorization');
  });

  it('asks before acting on a consent screen or a permissions page', () => {
    expect(
      approvalRequirement({
        toolName: 'click',
        args: { index: 1 },
        pageUrl: 'https://app.example.com/oauth/authorize?client_id=a&response_type=code',
      }).reason,
    ).toBe('authorization');
    expect(
      approvalRequirement({
        toolName: 'click',
        args: { index: 1 },
        pageUrl: 'https://github.com/settings/applications',
      }).reason,
    ).toBe('permission_change');
    expect(
      approvalRequirement({
        toolName: 'scroll',
        args: {},
        pageUrl: 'https://github.com/settings/applications',
      }),
    ).toEqual({ alwaysAsk: false });
  });

  it('leaves routine steps on an ordinary page to the ask-before-acting preference', () => {
    expect(approvalRequirement({ toolName: 'click', args: { index: 1 }, pageUrl: plain })).toEqual({
      alwaysAsk: false,
    });
    expect(
      approvalRequirement({
        toolName: 'read_network',
        args: {},
        pageUrl: 'https://secure.chase.com',
      }),
    ).toEqual({ alwaysAsk: false });
  });

  it('explains the reason to the person asked and in a refusal', () => {
    expect(
      describeApprovalReason({ alwaysAsk: true, reason: 'sensitive_site', siteClass: 'health' }),
    ).toContain('health site');
    expect(describeApprovalReason({ alwaysAsk: false })).toBeNull();
    expect(alwaysAskRefusal({ alwaysAsk: true, reason: 'download' })).toContain(
      'always needs approval',
    );
  });
});
