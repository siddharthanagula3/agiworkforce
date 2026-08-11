import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import sitemap from '@/app/sitemap';
import { GET as securityTxt } from '@/app/.well-known/security.txt/route';
import {
  CANONICAL_POLICY_ROUTES,
  CONTACT_EMAIL,
  POLICY_ROUTE_ALIASES,
} from '@/lib/legal-constants';

/**
 * Guards for the legal and policy set.
 *
 * These are regression guards, not documentation. Each one corresponds to a
 * defect that was actually shipped:
 *
 *  - Three policies existed at two URLs each. Duplicate legal text that drifts
 *    is a liability, so there must be exactly one page per policy and the
 *    aliases must be permanent redirects declared in next.config.ts.
 *  - Policy pages made concrete claims the code contradicted (an email
 *    processor that receives nothing, log/backup retention nothing enforces,
 *    "RLS-enforced" as an absolute, audit trails advertised as delivered). The
 *    prohibited-claim guard fails the build if any of them reappears.
 *  - Policy pages were unreachable from the footer, so a procurement reviewer
 *    could not find the DPA or the cookie policy.
 */

const APP_DIR = path.join(__dirname, '..');
const WEB_DIR = path.join(APP_DIR, '..');

function readAppFile(...segments: string[]): string {
  return readFileSync(path.join(APP_DIR, ...segments), 'utf8');
}

/**
 * Strip source comments before scanning for prohibited claims.
 *
 * The policy pages carry a header comment naming each unsupportable claim that
 * was removed and the code reason it could not be supported. That note is the
 * most useful thing in the file for the next editor — it is why the claim does
 * not come back. Scanning raw source made the guard fire on its own
 * documentation, which would have pressured a future editor to delete the
 * explanation to get the build green. Only published copy can mislead a reader,
 * so only published copy is scanned.
 *
 * Block comments are removed wholesale; line comments are removed only when the
 * line starts with `//` or a JSDoc `*` continuation, so that a `https://` inside
 * real page copy is never mangled.
 */
function readPublishedCopy(...segments: string[]): string {
  return readAppFile(...segments)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

describe('legal policy set — one canonical page per policy', () => {
  it('has a page for every canonical policy route', () => {
    for (const route of Object.values(CANONICAL_POLICY_ROUTES)) {
      const pagePath = path.join(APP_DIR, route.replace(/^\//, ''), 'page.tsx');
      expect(existsSync(pagePath), `${route} should be backed by ${pagePath}`).toBe(true);
    }
  });

  it('has no page.tsx for any alias route', () => {
    // A `redirect()` stub page emits a 307 and renders a React route on every
    // hit. Aliases belong in next.config.ts, not in the app directory.
    for (const alias of Object.keys(POLICY_ROUTE_ALIASES)) {
      const pagePath = path.join(APP_DIR, alias.replace(/^\//, ''), 'page.tsx');
      expect(
        existsSync(pagePath),
        `${alias} must be a redirect in next.config.ts, not a page at ${pagePath}`,
      ).toBe(false);
    }
  });

  it('declares every alias as a permanent redirect in next.config.ts', () => {
    const config = readFileSync(path.join(WEB_DIR, 'next.config.ts'), 'utf8');
    for (const [alias, canonical] of Object.entries(POLICY_ROUTE_ALIASES)) {
      const line = new RegExp(
        `source:\\s*'${alias}'\\s*,\\s*destination:\\s*'${canonical}'\\s*,\\s*permanent:\\s*true`,
      );
      expect(line.test(config), `${alias} -> ${canonical} must be a permanent redirect`).toBe(true);
    }
  });

  it('lists every canonical policy route in the sitemap and no alias', () => {
    const urls = sitemap().map((entry) => entry.url);
    for (const route of Object.values(CANONICAL_POLICY_ROUTES)) {
      expect(
        urls.some((url) => url.endsWith(route)),
        `${route} should be in the sitemap`,
      ).toBe(true);
    }
    for (const alias of Object.keys(POLICY_ROUTE_ALIASES)) {
      expect(
        urls.some((url) => url.endsWith(alias)),
        `${alias} is a redirect and must not be in the sitemap`,
      ).toBe(false);
    }
  });
});

describe('legal policy set — discoverability', () => {
  it('links the core policies plus the legal index from the marketing footer', () => {
    const footer = readFileSync(
      path.join(WEB_DIR, 'features/marketing/components/MarketingFooter.tsx'),
      'utf8',
    );
    for (const href of ['/privacy', '/terms', '/security', '/cookies', '/legal']) {
      expect(footer.includes(`'${href}'`), `footer should link ${href}`).toBe(true);
    }
  });

  it('lists every published legal document on the /legal index', () => {
    const index = readAppFile('legal', 'page.tsx');
    for (const route of Object.values(CANONICAL_POLICY_ROUTES)) {
      if (route === CANONICAL_POLICY_ROUTES.legalIndex) continue;
      expect(index.includes(`'${route}'`), `/legal should link ${route}`).toBe(true);
    }
  });
});

describe('legal policy set — prohibited claims', () => {
  // Each entry: the string that must not reappear, and why it was removed.
  const BANNED: { pattern: RegExp; why: string; files: string[] }[] = [
    {
      pattern: /announced via email|notify customers[^.]*30 days in advance/i,
      why: 'There is no transactional email provider in this repository, so emailed notice cannot be performed.',
      files: ['privacy/page.tsx', 'terms/page.tsx', 'subprocessors/page.tsx', 'dpa/page.tsx'],
    },
    {
      pattern: /name:\s*'Resend'/,
      why: 'Resend is not wired anywhere; listing a processor that receives nothing makes the list unreliable.',
      files: ['subprocessors/page.tsx'],
    },
    {
      pattern: /RLS-enforced;\s*only you can read your rows/i,
      why: 'Database RLS bites on the user-scoped sync paths, not universally. The honest claim is two layers.',
      files: ['privacy/page.tsx', 'dpa/page.tsx'],
    },
    {
      pattern: /30 days by default\.\s*Up to 180 days|30-day rolling/i,
      why: 'No log or backup retention window is set, enforced or tested anywhere in the repository.',
      files: ['privacy/page.tsx'],
    },
    {
      pattern: /Google Tag Manager/i,
      why: 'No GTM container is loaded; the analytics component loads gtag.js directly.',
      files: ['privacy/page.tsx', 'cookies/page.tsx'],
    },
    {
      pattern: /Org-level retention windows on Enterprise/i,
      why: 'No per-organisation conversation retention window is enforced on the conversation path.',
      files: ['privacy/page.tsx'],
    },
    {
      pattern: /Auth session, CSRF token/i,
      why: 'No CSRF cookie is set; the control is an x-csrf-token request header bound to a session.',
      files: ['cookies/page.tsx'],
    },
    {
      pattern: /\b(SOC ?2|ISO ?27001|HIPAA)[- ](certified|compliant|attested)\b/i,
      why: 'AGI holds no SOC 2 report, ISO 27001 certificate or HIPAA position. These may only be referenced as absences.',
      files: ['dpa/page.tsx', 'terms/page.tsx', 'privacy/page.tsx', 'legal/page.tsx'],
    },
    {
      pattern: /\bwe are (SOC ?2|ISO ?27001|HIPAA)/i,
      why: 'Same: no certification exists to claim.',
      files: ['dpa/page.tsx', 'terms/page.tsx', 'privacy/page.tsx', 'legal/page.tsx'],
    },
  ];

  for (const { pattern, why, files } of BANNED) {
    for (const file of files) {
      it(`${file} does not reintroduce: ${pattern.source.slice(0, 48)}`, () => {
        expect(pattern.test(readPublishedCopy(...file.split('/'))), why).toBe(false);
      });
    }
  }

  it('states the Managed Cloud public-alpha status on the terms, privacy and DPA pages', () => {
    for (const file of ['terms/page.tsx', 'privacy/page.tsx', 'dpa/page.tsx']) {
      expect(/public alpha/i.test(readAppFile(...file.split('/'))), `${file}`).toBe(true);
    }
  });

  it('discloses the object-storage access model on the privacy page', () => {
    const privacy = readPublishedCopy('privacy', 'page.tsx').replace(/\s+/g, ' ');
    const subprocessors = readPublishedCopy('subprocessors', 'page.tsx').replace(/\s+/g, ' ');
    expect(privacy).toMatch(/authenticated same-origin file route/i);
    expect(privacy).toMatch(/owning account.*active Personal or organisation workspace/i);
    expect(privacy).toMatch(/videos use a.*private bucket/i);
    expect(privacy).toMatch(/non-video files remain in a public R2.*without signing in/i);
    expect(subprocessors).toMatch(/signed-in, active-workspace-scoped app route/i);
    expect(subprocessors).toMatch(/non-video files remain in a public bucket/i);
    expect(privacy).not.toMatch(/served from permanent public URLs/i);
    expect(subprocessors).not.toMatch(/served from permanent public URLs/i);
  });

  it('does not turn AGI no-training language into a promise about third-party providers', () => {
    const privacy = readPublishedCopy('privacy', 'page.tsx');
    const terms = readPublishedCopy('terms', 'page.tsx');
    for (const source of [privacy, terms]) {
      const normalized = source.replace(/\s+/g, ' ');
      expect(normalized).toMatch(/AGI-owned models/i);
      expect(normalized).toMatch(/applicable terms and data-use policies/i);
      expect(normalized).toMatch(/not a promise/i);
      expect(normalized).toMatch(/OpenRouter/i);
    }
  });

  it('uses the proven contact routing and avoids unsupported response deadlines', () => {
    const privacy = readPublishedCopy('privacy', 'page.tsx');
    const security = readAppFile('security', 'page.tsx');
    expect(privacy).toContain('contactMailto(CONTACT_SUBJECTS.privacy)');
    expect(privacy).not.toMatch(/respond within 30 days/i);
    expect(security).toContain('contactMailto(CONTACT_SUBJECTS.security)');
    expect(security).not.toMatch(/within 3 business days|within 10 business days/i);
  });
});

describe('legal policy set — entity facts come from one place', () => {
  const PAGES = [
    'terms/page.tsx',
    'privacy/page.tsx',
    'dpa/page.tsx',
    'legal/eu-representative/page.tsx',
  ];

  it('imports the legal constants rather than hardcoding the entity', () => {
    for (const file of PAGES) {
      const source = readAppFile(...file.split('/'));
      expect(source.includes('legal-constants'), `${file} should import legal-constants`).toBe(
        true,
      );
      expect(
        source.includes("'AGI Automation LLC'"),
        `${file} should not hardcode the entity name`,
      ).toBe(false);
    }
  });

  it('publishes one notice address across the policy set', () => {
    // /terms and /privacy said "Austin, Texas, USA" while /mobile/legal said
    // Sheridan, Wyoming. One company cannot publish two notice addresses.
    for (const file of ['terms/page.tsx', 'privacy/page.tsx']) {
      expect(/Austin, Texas/i.test(readAppFile(...file.split('/'))), file).toBe(false);
    }
  });
});

describe('security.txt', () => {
  it('serves an RFC 9116 document with the required fields', async () => {
    const response = securityTxt();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/plain');

    const body = await response.text();
    expect(body).toContain(`Contact: mailto:${CONTACT_EMAIL}`);
    expect(body).toMatch(/^Expires: /m);
    expect(body).toMatch(/^Canonical: https?:\/\/\S+\/\.well-known\/security\.txt$/m);
    expect(body).toMatch(/^Policy: https?:\/\/\S+\/security#report$/m);
  });

  it('has an Expires value in the future', async () => {
    // RFC 9116 §2.5.5 requires a future timestamp. It is computed per request
    // rather than checked in, so this guards the computation, not a literal.
    const text = await securityTxt().text();
    const expires = /^Expires: (.+)$/m.exec(text)?.[1];
    expect(expires).toBeDefined();
    expect(new Date(expires as string).getTime()).toBeGreaterThan(Date.now());
  });
});
