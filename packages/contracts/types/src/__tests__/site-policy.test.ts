import { describe, expect, it } from 'vitest';

import {
  SITE_POLICY_ADMIN_UNAVAILABLE,
  evaluateSitePolicy,
  parseAdminSitePolicy,
  sitePolicyDenialMessage,
  type AdminSitePolicy,
} from '../site-policy';

const admin = (partial: Partial<AdminSitePolicy>): AdminSitePolicy => ({
  version: 1,
  blocklist: [],
  allowlist: [],
  ...partial,
});

describe('evaluateSitePolicy', () => {
  it('blocks over any allow, and wildcards cover subdomains', () => {
    const policy = admin({ blocklist: [{ pattern: 'https://*.corp.example' }] });
    expect(
      evaluateSitePolicy(
        { admin: policy, userAllowlist: ['https://wiki.corp.example'] },
        'https://wiki.corp.example/page',
        'automation',
      ),
    ).toMatchObject({ allowed: false, reason: 'admin-blocked' });
  });

  it('grants the user allowlist only while no admin allowlist bounds it', () => {
    expect(
      evaluateSitePolicy(
        { admin: null, userAllowlist: ['https://work.example'] },
        'https://work.example/a',
        'automation',
      ).allowed,
    ).toBe(true);
    expect(
      evaluateSitePolicy(
        {
          admin: admin({ allowlist: [{ pattern: 'https://other.example' }] }),
          userAllowlist: ['https://work.example'],
        },
        'https://work.example/a',
        'automation',
      ).reason,
    ).toBe('outside-admin-allowlist');
  });

  it('evaluates upload and download independently of automation', () => {
    const policy = admin({
      allowlist: [{ pattern: 'https://work.example' }],
      blocklist: [{ pattern: 'https://work.example', capabilities: ['download'] }],
    });
    const input = { admin: policy, userAllowlist: [] };
    expect(evaluateSitePolicy(input, 'https://work.example/a', 'automation').allowed).toBe(true);
    expect(evaluateSitePolicy(input, 'https://work.example/a', 'upload').allowed).toBe(true);
    expect(evaluateSitePolicy(input, 'https://work.example/a', 'download').allowed).toBe(false);
  });

  it('denies everything while the admin policy is unreadable', () => {
    expect(
      evaluateSitePolicy(
        { admin: SITE_POLICY_ADMIN_UNAVAILABLE, userAllowlist: ['https://work.example'] },
        'https://work.example',
        'automation',
      ).reason,
    ).toBe('admin-unavailable');
  });
});

describe('parseAdminSitePolicy', () => {
  it('refuses a document with an unusable pattern rather than dropping the rule', () => {
    expect(parseAdminSitePolicy({ version: 1, blocklist: ['corp.example'] }).ok).toBe(false);
    expect(parseAdminSitePolicy({ version: 1, blocklist: ['https://corp.example'] }).ok).toBe(true);
  });
});

describe('sitePolicyDenialMessage', () => {
  it('names the org for an org decision and defers to the surface otherwise', () => {
    const blocked = evaluateSitePolicy(
      { admin: admin({ blocklist: [{ pattern: 'https://a.example' }] }), userAllowlist: [] },
      'https://a.example',
      'upload',
    );
    expect(sitePolicyDenialMessage(blocked, 'fallback')).toContain(
      "your organization's site policy",
    );

    const unapproved = evaluateSitePolicy(
      { admin: null, userAllowlist: [] },
      'https://a.example',
      'automation',
    );
    expect(sitePolicyDenialMessage(unapproved, 'fallback')).toBe('fallback');
  });
});
