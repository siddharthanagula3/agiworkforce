import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import ts from 'typescript';

import sitemap from '@/app/sitemap';
import { GET as securityTxt } from '@/app/.well-known/security.txt/route';
import {
  CANONICAL_POLICY_ROUTES,
  CONTACT_EMAIL,
  POLICY_ROUTE_ALIASES,
} from '@/lib/legal-constants';

const APP_DIR = path.join(__dirname, '..');
const WEB_DIR = path.join(APP_DIR, '..');

function readAppFile(...segments: string[]): string {
  return readFileSync(path.join(APP_DIR, ...segments), 'utf8');
}

function readPublishedCopy(...segments: string[]): string {
  return readAppFile(...segments)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');
}

function ledgerCopy(file: string[], tableName: string, label: string): string {
  const source = readAppFile(...file);
  const parsed = ts.createSourceFile(
    'page.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const declarations = parsed.statements.flatMap((statement) =>
    ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [],
  );
  const table = declarations.find((declaration) => declaration.name.getText(parsed) === tableName);
  if (!table?.initializer || !ts.isArrayLiteralExpression(table.initializer)) {
    throw new Error(`Unmeasured policy ledger ${tableName}`);
  }
  const rows = table.initializer.elements.filter((row) => {
    if (!ts.isObjectLiteralExpression(row)) throw new Error('Unmeasured policy row');
    return row.properties.some(
      (property) =>
        ts.isPropertyAssignment(property) &&
        property.name.getText(parsed) === 'label' &&
        ts.isStringLiteral(property.initializer) &&
        property.initializer.text === label,
    );
  });
  expect(rows, `${tableName} must contain exactly one ${label} row`).toHaveLength(1);
  return rows[0]?.getText(parsed).replace(/\s+/g, ' ') ?? '';
}

describe('legal policy set, one canonical page per policy', () => {
  it('has a page for every canonical policy route', () => {
    for (const route of Object.values(CANONICAL_POLICY_ROUTES)) {
      const pagePath = path.join(APP_DIR, route.replace(/^\//, ''), 'page.tsx');
      expect(existsSync(pagePath), `${route} should be backed by ${pagePath}`).toBe(true);
    }
  });

  it('has no page.tsx for any alias route', () => {
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

describe('legal policy set, discoverability', () => {
  it('links the core policies plus the legal index from the marketing footer', () => {
    const footer =
      readFileSync(
        path.join(WEB_DIR, 'features/marketing/components/system/MarketingFooter.tsx'),
        'utf8',
      ) + readFileSync(path.join(WEB_DIR, 'features/marketing/components/system/nav.ts'), 'utf8');
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

describe('legal policy set, prohibited claims', () => {
  const BANNED: { pattern: RegExp; why: string; files: string[] }[] = [
    {
      pattern: /announced via email|notify customers[^.]*30 days in advance/i,
      why: 'No mailing path can reach an arbitrary list of customers, so a promise of emailed notice cannot be performed. (The product CAN send support-escalation and scheduled-task email, see the Resend guard below, but neither can do a broadcast.)',
      files: ['privacy/page.tsx', 'terms/page.tsx', 'subprocessors/page.tsx', 'dpa/page.tsx'],
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
      pattern: /no per-organisation retention window is enforced/i,
      why: 'RETIRED 2026-09-12 as a removal and reinstated as a denial. A per-organisation conversation retention window IS enforced: lib/services/retention-service.ts deletes workspace conversations past it and /api/cron/enforce-workspace-retention runs nightly. The disclosure is required by app/__tests__/legal-surface-claims.test.ts.',
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
    {
      pattern: /MiniMax[^.]*through OpenRouter/i,
      why: 'No MiniMax route is admitted for Managed Cloud traffic, so naming it as an OpenRouter recipient discloses a transfer that does not happen. Its models are reachable only with a customer key, as /subprocessors records.',
      files: ['privacy/page.tsx', 'faq/page.tsx'],
    },
    {
      pattern: /released\s+CLI|POSITIONING\.trustBoundary/i,
      why: 'A policy is a dated version. It names the CLI and points to /download for release state, because a typed or interpolated status changes the published text with no new version.',
      files: ['privacy/page.tsx'],
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
    expect(privacy).toMatch(
      /New uploads and generated files, videos included, are written to a private bucket/i,
    );
    expect(privacy).toMatch(
      /Profile pictures are the exception: they are stored in a public R2 bucket, the product returns their address[^.]*without signing in/i,
    );
    expect(privacy).toMatch(
      /Files stored before[^.]*may remain in the public bucket[^.]*without signing in/i,
    );
    expect(privacy).not.toMatch(/non-video files remain in a public/i);
    expect(privacy).not.toMatch(/responses do not (?:expose|return)[^.]*raw/i);
    expect(subprocessors).toMatch(/signed-in, active-workspace-scoped app route/i);
    expect(subprocessors).toMatch(/non-video files remain in a public bucket/i);
    expect(privacy).not.toMatch(/served from permanent public URLs/i);
    expect(subprocessors).not.toMatch(/served from permanent public URLs/i);
  });

  it('does not re-date the collection-table expansion with the policy date', () => {
    const privacy = readPublishedCopy('privacy', 'page.tsx').replace(/\s+/g, ' ');
    expect(privacy).toContain('Why this table grew.');
    expect(privacy).not.toMatch(/Why this table grew on \{/);
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

  it('links the published terms for the named model gateways and API providers', () => {
    const terms = readAppFile('terms', 'page.tsx');
    for (const provider of [
      'OpenRouter',
      'OpenAI',
      'Anthropic',
      'CheaperInference',
      'DeepSeek',
      'Qwen Cloud',
      'Moonshot AI',
      'Z.ai',
      'MiniMax',
      'Experiential Labs',
    ]) {
      expect(terms, provider).toContain(`name: '${provider}`);
    }
    expect(terms).toContain('providers&rsquo; current published API or platform terms');
    expect(terms).toContain('They do not mean every');
  });

  it('does not present the retained Tauri release pipeline as the public Desktop download', () => {
    const security = readAppFile('security', 'page.tsx');
    expect(security).not.toMatch(/The installer is signed through Azure Trusted Signing/);
    expect(security).not.toMatch(/publishes a notarized universal disk image/);
    expect(security).not.toMatch(/no backup-restore test evidence/i);
  });

  it('discloses the transactional email provider that is actually wired', () => {
    const clientPath = path.join(WEB_DIR, 'lib/support/handoff/resend-client.ts');
    if (!existsSync(clientPath)) return;

    const subprocessors = readPublishedCopy('subprocessors', 'page.tsx');
    expect(
      subprocessors,
      'lib/support/handoff/resend-client.ts exists, so /subprocessors must list the provider',
    ).toMatch(/name:\s*'Resend'/);
  });

  it('does not claim the product has no transactional email system', () => {
    for (const file of [
      'privacy/page.tsx',
      'terms/page.tsx',
      'subprocessors/page.tsx',
      'dpa/page.tsx',
      'security/page.tsx',
      'trust/page.tsx',
    ]) {
      const copy = readPublishedCopy(...file.split('/')).replace(/\s+/g, ' ');
      expect(copy, `${file} must not claim there is no transactional email system`).not.toMatch(
        /there is no transactional email (system|provider)/i,
      );
      expect(
        copy,
        `${file} must not claim we do not operate a transactional email system`,
      ).not.toMatch(/we do not operate a transactional email/i);
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

describe('legal policy set, entity facts come from one place', () => {
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
    for (const file of ['terms/page.tsx', 'privacy/page.tsx']) {
      expect(/Austin, Texas/i.test(readAppFile(...file.split('/'))), file).toBe(false);
    }
  });
});

describe('legal policy set, account marketing email consent', () => {
  it('discloses the canonical optional account purpose in both account-data rows', () => {
    const account = ledgerCopy(['privacy', 'page.tsx'], 'COLLECT_LEDGER', 'Account');
    const india = ledgerCopy(
      ['privacy', 'india', 'page.tsx'],
      'PROCESSING',
      'Email address, account identifier, authentication metadata',
    );
    for (const row of [account, india]) {
      expect(row).toContain('MARKETING_EMAIL_CONSENT_PURPOSE.label');
      expect(row).toMatch(/only if you choose.*separately|separate box/i);
      expect(row).toContain('We do not store your password');
    }
    expect(account).not.toMatch(/only if you tick.*sign-up.*or turn it on in Settings/i);
  });

  it('separates account marketing from waitlist updates and states the bounded first-acceptance choice', () => {
    const marketing = ledgerCopy(['privacy', 'page.tsx'], 'BASIS_LEDGER', 'Marketing email');
    expect(marketing).toContain('your account email');
    expect(marketing).toContain('MARKETING_EMAIL_CONSENT_PURPOSE.label');
    expect(marketing).toMatch(/separate unticked box/i);
    expect(marketing).toMatch(/first accept.*terms.*no decision/i);
    expect(marketing).toContain('Settings, Privacy');
    expect(marketing).toContain('CANONICAL_POLICY_ROUTES.dataRights');
    expect(marketing).toMatch(/revision of (?:this|the privacy) notice/i);
    expect(marketing).not.toMatch(/unsubscribe link|will (?:send|email)|emailed notice/i);

    const waitlist = ledgerCopy(
      ['privacy', 'page.tsx'],
      'COLLECT_LEDGER',
      'Enterprise contact list',
    );
    expect(waitlist).toContain(
      'product updates separately and decline that without leaving the list',
    );
    const indiaWaitlist = ledgerCopy(
      ['privacy', 'india', 'page.tsx'],
      'PROCESSING',
      'Email address given for Enterprise access',
    );
    expect(indiaWaitlist).toContain('Optionally, product updates: a separate box');
  });

  it('does not claim an unticked signup marketing box records a refusal or that every stored choice starts unticked', () => {
    const india = readPublishedCopy('privacy', 'india', 'page.tsx').replace(/\s+/g, ' ');
    expect(india).not.toMatch(/every box is unticked when you meet it/i);
    expect(india).not.toMatch(/every decision \(including the boxes you leave unticked\)/i);
    expect(india).toMatch(/early-access forms.*includes the boxes you leave unticked/i);
    expect(india).toMatch(/sign-up.*marketing email box you leave unticked records no decision/i);
    expect(india).toContain('CONSENT_PURPOSES.map');
  });

  it('describes GPC grant refusals without promising to erase a previously stored Settings grant', () => {
    const cookies = readPublishedCopy('cookies', 'page.tsx').replace(/\s+/g, ' ');
    expect(cookies).not.toMatch(/does not overrule a form you fill in yourself/i);
    expect(cookies).not.toMatch(/that tick is your instruction and we act on it/i);
    expect(cookies).toMatch(/Sec-GPC.*new.*optional.*grants.*refusals/i);
    expect(cookies).toContain('MARKETING_EMAIL_CONSENT_PURPOSE.label');
    expect(cookies).toMatch(/waitlist.*product updates/i);
    expect(cookies).toMatch(/existing.*Settings.*not.*erased/i);
    expect(cookies).toContain('GLOBAL_PRIVACY_CONTROL_BLOCKS_GRANT_NOTICE');
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
    const text = await securityTxt().text();
    const expires = /^Expires: (.+)$/m.exec(text)?.[1];
    expect(expires).toBeDefined();
    expect(new Date(expires as string).getTime()).toBeGreaterThan(Date.now());
  });
});
