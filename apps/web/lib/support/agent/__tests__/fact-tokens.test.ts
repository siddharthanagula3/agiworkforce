import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BILLING_PLAN_CAPABILITY_TIERS,
  BILLING_PLAN_PRICING,
  CONNECTORS_COMING_SOON_DETAIL,
  CONNECTORS_COMING_SOON_MESSAGE,
  billingPlanCapabilityPlanLabels,
  canUseBillingPlanCapability,
  connectorsReleased,
  getBillingPlanPricing,
  getEffectivePlanCreditAllowance,
  type BillingPlanCapability,
  type BillingPlanTier,
} from '@agiworkforce/types';
import { CATALOG_SCOPES } from '@/lib/catalog-scopes';
import { CONTACT_EMAIL } from '@/lib/legal-constants';
import {
  CLI_AVAILABILITY_NOTE,
  SURFACE_IDS,
  SURFACE_NAMES,
  SURFACE_STATUS,
  isReleased,
  surfaceAvailabilitySummary,
} from '@/lib/surface-status';
import { STATIC_ARTICLES, STATIC_FAQS } from '@/lib/support/static-data';
import { getSupportCorpus, interpolateFacts } from '../corpus';

const WEB_ROOT = join(__dirname, '..', '..', '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');
const ARTICLES_DIR = join(WEB_ROOT, 'content', 'support');
const TOKEN = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;

const ARTICLES = readdirSync(ARTICLES_DIR)
  .filter((name) => name.endsWith('.md'))
  .sort()
  .map((name) => ({
    id: name.replace(/\.md$/, ''),
    source: readFileSync(join(ARTICLES_DIR, name), 'utf8'),
  }));

function article(id: string): string {
  const found = ARTICLES.find((entry) => entry.id === id);
  if (!found) throw new Error(`no help article "${id}"`);
  return found.source;
}

function rendered(id: string): string {
  return interpolateFacts(article(id), id).replace(/\s+/g, ' ');
}

function staticText(id: string): string {
  const faq = STATIC_FAQS.find((entry) => entry.id === id);
  if (faq) return `${faq.question} ${faq.answer}`;
  const entry = STATIC_ARTICLES.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`no static support entry "${id}"`);
  return entry.content;
}

describe('help article fact tokens', () => {
  it('gives help articles a status word for every surface, read from the registry', () => {
    for (const surface of SURFACE_IDS) {
      expect(interpolateFacts(`{{STATUS.${surface}}}`, 'probe')).toBe(
        SURFACE_STATUS[surface].toLowerCase(),
      );
    }
    expect(interpolateFacts('{{SURFACES.names}}', 'probe')).toBe(
      'Web, Desktop, CLI, Mobile, VS Code and Chrome',
    );
    for (const surface of SURFACE_IDS) {
      expect(interpolateFacts('{{SURFACES.names}}', 'probe')).toContain(SURFACE_NAMES[surface]);
    }
  });

  it('gives help articles plan names and plan lists read from the billing catalogue', () => {
    expect(interpolateFacts('{{PLAN.free}}', 'probe')).toBe(getBillingPlanPricing('free').label);
    expect(interpolateFacts('{{PLANS.agi_work}}', 'probe')).toBe(
      billingPlanCapabilityPlanLabels('agi_work'),
    );
    expect(interpolateFacts('{{PLANS.agi_work}}', 'probe')).not.toContain(
      getBillingPlanPricing('free').label,
    );
  });

  it('gives help articles a label for every plan and a plan list for every capability', () => {
    for (const plan of Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[]) {
      expect(interpolateFacts(`{{PLAN.${plan.replace(/-/g, '_')}}}`, 'probe'), plan).toBe(
        getBillingPlanPricing(plan).label,
      );
    }
    for (const capability of Object.keys(
      BILLING_PLAN_CAPABILITY_TIERS,
    ) as BillingPlanCapability[]) {
      expect(interpolateFacts(`{{PLANS.${capability}}}`, 'probe'), capability).toBe(
        billingPlanCapabilityPlanLabels(capability),
      );
    }
  });

  it('gives help articles the support address from the legal constants', () => {
    expect(interpolateFacts('{{CONTACT.email}}', 'probe')).toBe(CONTACT_EMAIL);
    const typed = ARTICLES.filter(({ source }) => source.includes(CONTACT_EMAIL)).map(
      ({ id }) => id,
    );
    expect(typed).toEqual([]);
    for (const id of ['troubleshooting', 'search', 'signing-up']) {
      expect(article(id), id).toContain('{{CONTACT.email}}');
      expect(rendered(id), id).toContain(CONTACT_EMAIL);
    }
  });

  it('states the connector release status, and says nothing once connectors are released', () => {
    expect(interpolateFacts('{{AVAILABILITY.connectors}}', 'probe')).toBe(
      connectorsReleased() ? '' : CONNECTORS_COMING_SOON_MESSAGE,
    );
    expect(interpolateFacts('{{AVAILABILITY.connectorApps}}', 'probe')).toBe(
      connectorsReleased() ? '' : CONNECTORS_COMING_SOON_DETAIL,
    );
  });

  it('resolves every token a help article uses', () => {
    const used = ARTICLES.flatMap(({ id, source }) =>
      [...source.matchAll(TOKEN)].map((match) => ({ id, token: match[1] ?? '' })),
    );
    expect(used.length).toBeGreaterThan(10);
    for (const { id, token } of used) {
      expect(() => interpolateFacts(`{{${token}}}`, id), `${id}: {{${token}}}`).not.toThrow();
    }
    const corpus = getSupportCorpus();
    expect(corpus.available, corpus.available ? '' : corpus.reason).toBe(true);
  });
});

describe('help articles follow the release registries', () => {
  it('prints no CLI install command while the registry holds the CLI unreleased', () => {
    const printsInstaller = ARTICLES.filter(({ source }) =>
      /curl -fsSL|install\.sh \| (?:ba)?sh/.test(source),
    ).map(({ id }) => id);
    if (!isReleased('cli')) expect(printsInstaller).toEqual([]);
    expect(article('install-the-cli')).toContain('The CLI is {{STATUS.cli}}');
    expect(article('install-the-cli').replace(/\s+/g, ' ')).toContain(
      'shows the install command once a signed release is published; until then there is no install command to run.',
    );
  });

  it('does not say an unreleased Desktop ships a CLI', () => {
    const installArticle = rendered('install-the-cli');
    expect(installArticle).not.toMatch(/ships its own copy/i);
    expect(installArticle).toContain(
      `Desktop is ${SURFACE_STATUS.desktop.toLowerCase()} and VS Code is ${SURFACE_STATUS.vscode.toLowerCase()}.`,
    );
  });

  it.each([
    ['chrome-extension', 'The Chrome extension, AGI Browser Companion, is {{STATUS.chrome}}.'],
    [
      'troubleshooting',
      'The Chrome extension is {{STATUS.chrome}} and the VS Code extension is {{STATUS.vscode}}.',
    ],
    ['troubleshooting', 'The CLI is {{STATUS.cli}}, and these steps apply to an installed CLI.'],
    ['configuration', 'The CLI is {{STATUS.cli}}, and this page applies to an installed CLI.'],
    [
      'custom-instructions',
      'The CLI is {{STATUS.cli}} and the VS Code extension is {{STATUS.vscode}}',
    ],
    ['mcp-connections', 'The CLI is {{STATUS.cli}}.'],
    ['privacy-controls', 'The CLI is {{STATUS.cli}} and VS Code is {{STATUS.vscode}}.'],
  ])('%s takes its surface status from the registry', (id, sentence) => {
    expect(article(id).replace(/\s+/g, ' ')).toContain(sentence);
  });

  it.each(['chrome-extension', 'troubleshooting', 'privacy-controls'])(
    '%s types no publication status for an extension by hand',
    (id) => {
      expect(article(id)).not.toMatch(
        /is not published yet|extension is published yet|VS Code BYOK is coming soon/i,
      );
    },
  );

  it('does not send a VS Code user to a CLI the registry holds unreleased', () => {
    const section = rendered('troubleshooting').split('An extension will not connect')[1] ?? '';
    expect(section).toContain('so use the web app.');
    if (!isReleased('cli')) expect(section.split('Still stuck')[0]).not.toMatch(/use the CLI/i);
  });

  it('names every surface and its release state in the glossary', () => {
    const glossary = rendered('glossary');
    expect(glossary).toContain(surfaceAvailabilitySummary());
    expect(article('glossary')).not.toMatch(/one of the six places AGI runs/);
  });

  it.each([
    'glossary',
    'chat-basics',
    'tool-approvals',
    'troubleshooting',
    'connectors-and-mcp',
    'mcp-connections',
    'billing-and-plans',
  ])('%s carries the connector release status beside its connector steps', (id) => {
    expect(article(id)).toContain('{{AVAILABILITY.connectors}}');
    if (!connectorsReleased()) expect(rendered(id)).toContain(CONNECTORS_COMING_SOON_MESSAGE);
  });

  it.each(['schedules-and-triggers', 'projects'])(
    '%s carries the connected-apps release status beside what needs a connector',
    (id) => {
      expect(article(id)).toContain('{{AVAILABILITY.connectorApps}}');
      if (!connectorsReleased()) expect(rendered(id)).toContain(CONNECTORS_COMING_SOON_DETAIL);
    },
  );

  it('types no connector release status by hand in any article', () => {
    const typed = ARTICLES.filter(({ source }) =>
      /connectors are coming soon|other apps is coming soon|until (?:connectors|they) open|once (?:connectors|they) open\b/i.test(
        source,
      ),
    ).map(({ id }) => id);
    expect(typed).toEqual([]);
  });

  it('does not send a reader to the pricing page for connector limits it withholds', () => {
    expect(article('billing-and-plans').replace(/\s+/g, ' ')).toContain(
      'and adds the connector limits once connectors are open. {{AVAILABILITY.connectors}}',
    );
    expect(article('mcp-connections').replace(/\s+/g, ' ')).toContain(
      'the pricing page lists the figures once connectors are open.',
    );
    expect(article('connectors-and-mcp').replace(/\s+/g, ' ')).toContain(
      'The pricing page lists that limit once connectors are open.',
    );
  });

  it('does not say the composer lists your own connectors while they are locked', () => {
    expect(article('chat-basics')).not.toMatch(/lists your connectors/);
    expect(article('chat-basics')).toContain('lists **Connectors**. {{AVAILABILITY.connectors}}');
  });
});

describe('help articles follow the plan catalogue', () => {
  it('types no numbered plan label by hand', () => {
    const numbered = (Object.keys(BILLING_PLAN_PRICING) as BillingPlanTier[])
      .map((plan) => getBillingPlanPricing(plan).label)
      .filter((label) => /\d/.test(label));
    expect(numbered.length).toBeGreaterThan(1);
    for (const label of numbered) {
      const typed = ARTICLES.filter(({ source }) => source.includes(label)).map(({ id }) => id);
      expect(typed, label).toEqual([]);
    }
  });

  it('names the plans that carry managed cloud in the CLI from the catalogue', () => {
    expect(canUseBillingPlanCapability('basic', 'developer_surfaces')).toBe(false);
    expect(article('install-the-cli').replace(/\s+/g, ' ')).toContain(
      'Managed cloud access from the CLI requires one of these plans: {{PLANS.developer_surfaces}}.',
    );
    expect(article('install-the-cli')).not.toMatch(/part of the higher paid tiers/);
  });

  it('states AGI Work as a paid-plan feature and names the plans from the catalogue', () => {
    expect(canUseBillingPlanCapability('free', 'agi_work')).toBe(false);
    expect(canUseBillingPlanCapability('basic', 'agi_work')).toBe(false);
    expect(article('agi-work')).toContain(
      'AGI Work is a paid-plan feature, included on {{PLANS.agi_work}}.',
    );
    expect(article('agi-work')).not.toMatch(/higher-capacity work is a paid-plan feature/);
  });

  it('describes a usage meter for paid plans only', () => {
    const managedCloud = article('managed-cloud').replace(/\s+/g, ' ');
    expect(managedCloud).toContain('A paid plan carries a capacity allowance');
    expect(managedCloud).not.toContain('Each plan carries a capacity allowance');
    expect(managedCloud).toContain(
      'On the {{PLAN.free}} plan the usage view shows only **Upgrade**, never a meter.',
    );
  });

  it('keeps the authenticator sentence true whichever way the enrollment switch is set', () => {
    const security = article('account-security').replace(/\s+/g, ' ');
    expect(security).toContain(
      'can be switched off for a time: while it is, Settings, Security shows',
    );
    expect(security).not.toMatch(/backup codes are temporarily unavailable:/);
  });
});

describe('static support answers follow the catalogue and the registry', () => {
  it('builds the Basic and Pro comparison from the plan catalogue', () => {
    const answer = staticText('faq-003');
    const basic = getBillingPlanPricing('basic').label;
    const pro = getBillingPlanPricing('pro').label;
    expect(answer).toContain(`What is the difference between ${basic} and ${pro}?`);
    for (const capability of ['agi_work', 'deep_research', 'image_generation'] as const) {
      expect(canUseBillingPlanCapability('pro', capability), capability).toBe(true);
      expect(canUseBillingPlanCapability('basic', capability), capability).toBe(false);
    }
    expect(answer).toContain('AGI Work, Deep Research, and Image generation');
    expect(getEffectivePlanCreditAllowance('pro', null, null).monthly).toBeGreaterThan(
      getEffectivePlanCreditAllowance('basic', null, null).monthly,
    );
  });

  it('does not sell Chrome chat or an unreleased surface as a Pro addition', () => {
    const answer = staticText('faq-003');
    expect(canUseBillingPlanCapability('free', 'managed_chat')).toBe(true);
    expect(answer).not.toMatch(/Chrome/);
    for (const surface of SURFACE_IDS) {
      if (surface === 'web' || isReleased(surface)) continue;
      expect(answer, surface).not.toMatch(new RegExp(`\\b${SURFACE_NAMES[surface]}\\b`));
    }
  });

  it('states which surfaces are released through the registry summary', () => {
    const answer = staticText('faq-006');
    expect(answer).toContain(surfaceAvailabilitySummary());
    expect(answer).not.toMatch(/are published today|are not released yet/);
  });

  it('keeps VS Code account-key commands apart from provider keys', () => {
    const content = staticText('article-002');
    expect(content).toContain(
      'VS Code provider-key management requires a connected local CLI runtime and delegates key storage to that runtime.',
    );
    expect(content).toContain('manage the AGI Workforce account API key, not a provider key.');
    expect(content).not.toMatch(
      /unreleased extension|with VS Code SecretStorage|when a VSIX is published/,
    );
  });

  it('answers the storage question with the privacy article wording', () => {
    const answer = staticText('faq-005');
    const privacy = article('privacy-controls').replace(/\s+/g, ' ');
    expect(privacy).toContain(
      'In Local mode on the CLI, conversations stay on your device and are never uploaded.',
    );
    expect(answer).toContain(
      'In Local mode on the CLI, conversations stay on your device and are never uploaded.',
    );
    expect(answer).not.toMatch(/all data stays on your device|stored encrypted in our database/);
  });
});

describe('the enterprise security article states what the code does', () => {
  it('does not say nothing reaches AGI infrastructure in Local mode', () => {
    const source = article('enterprise-security').replace(/\s+/g, ' ');
    expect(source).not.toMatch(/nothing reaches AGI infrastructure/i);
    expect(source).toContain('They run in the CLI, which is {{STATUS.cli}}.');
    expect(source).toContain('Local mode runs in the CLI, which is {{STATUS.cli}}.');
    expect(source).toContain(
      'A signed-in CLI may still refresh the managed model catalog when it is not cached.',
    );
    expect(article('local-mode').replace(/\s+/g, ' ')).toContain(
      'Signed-in CLI startup may refresh the managed model catalog when it is not cached.',
    );
  });

  it('says a reply names its model, not that a route is printed on every reply', () => {
    const source = article('enterprise-security').replace(/\s+/g, ' ');
    expect(source).not.toMatch(/printed on every reply/i);
    expect(source).toContain(
      'The model that answered, named on the reply, and a **Local** mark on a reply from a model running on the device.',
    );
    const bubble = readFileSync(
      join(WEB_ROOT, 'features', 'chat', 'components', 'messages', 'MessageBubble.tsx'),
      'utf8',
    );
    expect(bubble).toContain('data-testid="message-answered-by"');
    expect(bubble).toContain("const LOCAL_BOUNDARY_LABEL = 'Local';");
    expect(bubble).toContain("trustBoundary.privacyMode === 'local'");
  });

  it('states the audit drain interval the cron manifest schedules', () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'vercel.json'), 'utf8')) as {
      crons?: { path: string; schedule: string }[];
    };
    const drain = manifest.crons?.find((cron) => cron.path === '/api/cron/drain-audit-streams');
    expect(drain?.schedule).toBe('*/30 * * * *');
    expect(article('enterprise-security').replace(/\s+/g, ' ')).toContain(
      'drained to a SIEM endpoint every thirty minutes.',
    );
  });
});

describe('the model picker article states what the picker does', () => {
  it('states no bare catalogue count and points at the scoped one', () => {
    const source = article('models-and-reasoning');
    expect(source).not.toMatch(/\{\{\s*MARKETING\.(?:models|providers)\./);
    expect(source).toContain('https://agiworkforce.com/help/providers-and-models');
    expect(article('providers-and-models').replace(/\s+/g, ' ')).toContain(
      'These are catalog counts rather than a list of models offered to every account.',
    );
  });

  it('promises no local-model section, which a browser never shows', () => {
    const composer = join(WEB_ROOT, 'features', 'chat', 'components', 'Composer');
    const label = /const LOCAL_SECTION_LABEL = '([^']+)';/.exec(
      readFileSync(join(composer, 'ComposerFooter.tsx'), 'utf8'),
    )?.[1];
    expect(label).toBeTruthy();
    expect(readFileSync(join(composer, 'ComposerFooter.localModels.test.tsx'), 'utf8')).toContain(
      `offers no ${label} section in a browser`,
    );
    expect(article('models-and-reasoning')).not.toContain(label);
  });

  it('names no thinking budget control, which the composer does not draw', () => {
    const body = article('models-and-reasoning').split('\n---\n').slice(1).join('\n---\n');
    expect(body).toContain('## Thinking and effort');
    expect(body).not.toMatch(/thinking budget/i);
  });
});

describe('static support answers state counts through their scope', () => {
  it('scopes the provider count to the provider-key list of the CLI', () => {
    const answer = staticText('faq-002');
    expect(answer).toContain(CATALOG_SCOPES.byokProviders.text);
    expect(answer).not.toMatch(/AGI supports .* provider integrations, including/);
    expect(answer).toContain(CLI_AVAILABILITY_NOTE);
  });

  it('describes the reply by the model it names, not by a route label', () => {
    const content = staticText('article-001');
    expect(content).not.toMatch(/route label/i);
    expect(content).toContain('The reply names the model that answered.');
    expect(content).toContain(surfaceAvailabilitySummary());
  });
});
