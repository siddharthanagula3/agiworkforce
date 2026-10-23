import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_DIR = path.resolve(__dirname, '..', '..');

function page(route: string): string {
  return readFileSync(path.join(APP_DIR, route, 'page.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '')
    .replace(/\s+/gu, ' ');
}

describe('company pages state certifications in the terms /trust uses', () => {
  it('keeps the wording on /trust that the other pages repeat', () => {
    expect(page('trust')).toContain('no auditor is engaged, and no audit is in progress');
  });

  it.each(['press', 'about', 'enterprise'])(
    '/%s says nothing is engaged or in progress',
    (route) => {
      const source = page(route);
      expect(source).toContain('no audit is in progress');
      expect(source).toMatch(/no auditor (?:or certification body )?is engaged/u);
    },
  );

  it.each(['press', 'about', 'enterprise'])('/%s plans no certification', (route) => {
    expect(page(route)).not.toMatch(
      /(?:SOC 2|ISO 27001)[^.]{0,80}\b(?:planned|roadmap)\b|On the roadmap/iu,
    );
  });
});

describe('/press, launch date and upgrade access', () => {
  const source = page('press');

  it('reads the launch date and the managed cloud status from their constants', () => {
    expect(source).toMatch(/\$\{PUBLIC_WEB_LAUNCH_DATE\}/u);
    expect(source).toMatch(/\$\{MANAGED_CLOUD_STATUS\}/u);
    expect(source).not.toMatch(/2026-06-27|27 June/u);
  });

  it('limits the no-waitlist statement to the Free plan and states the upgrade gate', () => {
    expect(source).toMatch(/\$\{PAID_UPGRADE_ACCESS_NOTE\}/u);
    expect(source).toMatch(
      /\$\{BILLING_PLAN_PRICING\.free\.label\} plan is open by default: sign in and start, with no waitlist and no invite/u,
    );
  });

  it('lists released and unreleased surfaces from the registry', () => {
    expect(source).toContain('productList(RELEASED_SURFACES)');
    expect(source).toContain('productList(UNRELEASED_SURFACES)');
    expect(source).toContain('label: COMING_SOON_LABEL');
    expect(source).not.toContain('Built, not yet released');
  });

  it('describes connectors through the release switch', () => {
    expect(source).toContain('connectorsReleased()');
    expect(source).not.toMatch(/artifacts, tools and connectors, memory/u);
  });

  it('names the surfaces each route runs on without excluding the rest', () => {
    expect(source).toMatch(
      /AGI Chat runs on managed cloud\. Local runs in the CLI\. BYOK runs on \$\{BYOK_SURFACES\.label\}\. \$\{BYOK_SURFACES\.availability\}`/u,
    );
    expect(source.match(/on(?:\s|\{' '\})+\{BYOK_SURFACES\.label\}\./gu)).toHaveLength(2);
    expect(source).not.toContain('BYOK_SURFACES.exclusion');
    expect(source).not.toMatch(/the other two routes run in the CLI/u);
    expect(source).not.toMatch(/provider-key routes run in the CLI/u);
  });

  it('leaves publication to the download page and counts surfaces from the registry', () => {
    expect(source).toContain('The download page shows what is published.');
    expect(source).not.toMatch(/none has a published release|nothing has shipped/iu);
    expect(source).toContain('{SURFACE_IDS.length} surfaces');
    expect(source).not.toMatch(/\bsix surfaces\b/iu);
  });
});

describe('unreleased Desktop is never described as a public product', () => {
  it('/enterprise reads the Desktop state from the registry', () => {
    const source = page('enterprise');
    expect(source).toMatch(
      /Desktop is managed-cloud only and is \$\{SURFACE_STATUS\.desktop\.toLowerCase\(\)\}\./u,
    );
    expect(source).not.toMatch(/current public Desktop/iu);
  });

  it('/about claims nothing about how a shipped surface is packaged', () => {
    const source = page('about');
    expect(source).not.toContain('native to its platform');
    expect(source).not.toMatch(/\bsix surfaces\b/iu);
    expect(source).toMatch(
      /it is built so that you choose whether a request runs on Local models/u,
    );
  });
});

describe('/customers, every scenario carries the state of the surface it runs on', () => {
  const source = page('customers');

  it('reads each scenario status from the registry', () => {
    const statuses = [...source.matchAll(/\bstatus: (SURFACE_STATUS\.\w+|'[^']*'|`[^`]*`),/gu)].map(
      (match) => match[1],
    );
    expect(statuses).toEqual(['SURFACE_STATUS.cli', 'SURFACE_STATUS.cli', 'SURFACE_STATUS.cli']);
  });

  it('does not call the scenarios shipped behaviour', () => {
    expect(source).not.toContain('behaviour that has shipped');
    expect(source).not.toContain('check the claim against the product yourself');
    expect(source.match(/\$\{CLI_AVAILABILITY_NOTE\}/gu)?.length).toBeGreaterThanOrEqual(2);
    expect(source).not.toContain('every other surface reports its own state');
  });
});

describe('/business, surfaces and routes carry their state', () => {
  const source = page('business');

  it('takes surface state from the registry', () => {
    expect(source).toContain('surfaceAvailabilitySummary()');
    expect(source).toContain('SURFACE_STATUS.cli.toLowerCase()');
    expect(source).toContain('SURFACE_STATUS.vscode.toLowerCase()');
    expect(source).not.toMatch(/across CLI, Desktop, and VS Code/u);
    expect(source).not.toMatch(/spans web, mobile, desktop, terminal, browser, and IDE/u);
  });

  it('starts adoption where a new account starts, and offers no per-seat BYOK', () => {
    expect(source).toMatch(/\$\{PAID_UPGRADE_ACCESS_NOTE\}/u);
    expect(source).not.toContain('Adoption starts with free Local and BYOK modes');
    expect(source).not.toMatch(/adoption can start before managed compute spend/iu);
    expect(source).not.toMatch(/per-seat BYOK/iu);
  });

  it('places local tool servers in the CLI, the only surface that runs them', () => {
    expect(source).toMatch(
      /local tool servers run by the CLI, behind explicit permission boundaries\.\$\{CONNECTORS_NOTE\} \$\{CLI_AVAILABILITY_NOTE\}/u,
    );
    expect(source).not.toMatch(/local desktop extensions/iu);
  });
});

describe('company pages describe Local mode as the enterprise help article does', () => {
  const article = readFileSync(
    path.join(APP_DIR, '..', 'content/support/enterprise-security.md'),
    'utf8',
  ).replace(/\s+/gu, ' ');

  it('keeps the sentence in the article that the pages repeat', () => {
    expect(article).toContain('conversations stay on your device and are never uploaded');
    expect(article).toContain(
      'A signed-in CLI may still refresh the managed model catalog when it is not cached.',
    );
  });

  it.each(['about', 'founder'])(
    '/%s says conversations stay on the device, not that nothing is ever sent',
    (route) => {
      const source = page(route);
      expect(source).toMatch(/Local Mode (?:that )?keeps your conversations on your device/u);
      expect(source).not.toMatch(/never phones home/iu);
    },
  );
});

describe('company pages state the catalogue through its scopes', () => {
  it.each(['press', 'about', 'business'])(
    '/%s counts catalogue entries and provider records, not integrations',
    (route) => {
      const source = page(route);
      expect(source).toContain('CATALOG_SCOPES.catalogueEntries.text');
      expect(source).toContain('CATALOG_SCOPES.providerRecords.text');
      expect(source).not.toMatch(/provider integrations|MARKETING\.(?:models|providers)\b/u);
    },
  );
});

describe('/partners, the protocol claim names the surface that implements it', () => {
  const source = page('partners');

  it('ties MCP to the CLI and its state', () => {
    expect(source).not.toContain('already works with it');
    expect(source).toMatch(/lede=\{`[^`]*AGI CLI[^`]*\$\{CLI_AVAILABILITY_NOTE\}`\}/u);
    expect(source).toContain('SURFACE_STATUS.desktop.toLowerCase()');
  });

  it('sends the directory button to the public catalogue', () => {
    expect(source).toContain("{ href: '/plugins', label: 'Browse the plugin catalogue'");
  });
});
