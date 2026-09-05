import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const WEB_ROOT = join(__dirname, '..');
const SKIPPED_SOURCE_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '__tests__']);

function readWebFile(path: string) {
  return readFileSync(join(WEB_ROOT, path), 'utf8');
}

const UNSOURCED_METRIC_PATTERNS = [
  /\b\d+(?:\.\d+)?\s?%\s+(?:faster|fewer|more|less|cheaper|higher|lower|of\s+(?:teams|users|customers))/i,
  /\b\d+(?:\.\d+)?x\s+(?:faster|cheaper|more|better|productive)/i,
  /\b\d[\d,]{2,}\+?\s+(?:users|teams|companies|developers|customers|businesses|organizations)\b/i,
  /\btrusted by\s+[\d\w]/i,
  /\bjoin\s+\d[\d,]*\+?\s/i,
  /\bsaves?\s+(?:you\s+)?\d+\s*(?:hours|hrs|minutes)\b/i,
];

function marketingPages(): string[] {
  return readdirSync(join(WEB_ROOT, 'app'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => join('app', entry.name, 'page.tsx'))
    .filter((path) => {
      try {
        readWebFile(path);
        return true;
      } catch {
        return false;
      }
    });
}

describe('public marketing copy regressions', () => {
  it('keeps local CLI examples tied to explicit discovered models', () => {
    const source = readWebFile('app/local/page.tsx');
    const getStarted = readWebFile('app/get-started/page.tsx');
    const renderedSource = source
      .replace(/\{' '\}/g, ' ')
      .replace(/<\/?span[^>]*>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ');

    expect(source).toContain('agi models scan');
    expect(renderedSource).toContain('agi --provider ollama --model <model>');
    expect(renderedSource).toContain('agi --provider lmstudio --model <model>');
    expect(getStarted).toContain('agi models scan');
    expect(getStarted).toContain('agi --provider ollama --model');
    expect(getStarted).toContain('&lt;model&gt;');
  });

  it('keeps public install commands aligned with the CLI release documentation', () => {
    const files = ['app/get-started/page.tsx', 'app/download/page.tsx', 'app/cli/page.tsx'];

    for (const file of files) {
      const source = readWebFile(file);

      expect(source, `${file} must not use sh installer`).not.toContain(
        'https://agiworkforce.com/install.sh | sh',
      );
      expect(source, `${file} must not use stale tap`).not.toContain(
        'siddharthanagula3/tap/agiworkforce',
      );
      expect(source, `${file} must not publish an unverified cargo crate install`).not.toContain(
        'cargo install agiworkforce-cli',
      );
    }

    for (const file of ['app/get-started/page.tsx', 'app/download/page.tsx']) {
      const source = readWebFile(file);

      expect(source, `${file} must not advertise the unverified curl installer`).not.toContain(
        'install.sh',
      );
      expect(source, `${file} must not advertise the unverified brew tap`).not.toContain(
        'brew install',
      );
    }

    const cliInstall = readWebFile('app/cli/page.tsx');

    expect(cliInstall, 'cli page must not advertise a cargo install').not.toContain(
      'cargo install',
    );
    expect(cliInstall, 'cli page must not advertise the unverified curl installer').not.toContain(
      'install.sh',
    );
    expect(cliInstall, 'cli page must not advertise the unverified brew tap').not.toContain(
      'brew install',
    );
    expect(cliInstall, 'cli page must read its status from the registry').toContain(
      'SURFACE_STATUS.cli',
    );
  });

  it('publishes no traction or performance number a reader cannot check', () => {
    const offenders: string[] = [];

    for (const page of marketingPages()) {
      const source = readWebFile(page);
      for (const pattern of UNSOURCED_METRIC_PATTERNS) {
        const match = pattern.exec(source);
        if (match) offenders.push(`${page}: ${match[0].trim()}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps published CLI versions out of hand-typed copy', () => {
    for (const file of ['app/download/page.tsx', 'app/cli/page.tsx', 'app/agi-code/page.tsx']) {
      const literals = readWebFile(file).match(/v?\d+\.\d+\.\d+/g) ?? [];

      expect(
        literals,
        `${file} must read the shipped version from SURFACE_STATUS or the live release endpoint`,
      ).toEqual([]);
    }
  });

  it('keeps public download CTAs away from unavailable installer API JSON', () => {
    const source = readWebFile('app/download/page.tsx');

    expect(source).not.toContain('/api/download?platform=windows');
    expect(source).not.toContain('/api/download?platform=linux');
    expect(source).not.toContain('subscription-backed chat');
  });

  it('keeps managed cloud waitlist copy scoped by surface trust boundary', () => {
    const waitlist = readWebFile('app/waitlist/page.tsx');
    const waitlistForm = readWebFile('app/byok/WaitlistForm.tsx');
    const normalizedWaitlist = waitlist.replace(/\s+/g, ' ');

    expect(waitlist).not.toContain('Cloud Managed is invite-only across Web, Mobile, Desktop, CLI');
    expect(normalizedWaitlist).toContain('open by default');
    expect(
      normalizedWaitlist,
      'byok release surface list must be derived from SURFACE_STATUS, not hardcoded',
    ).toContain('SURFACE_STATUS[surface.id] !== COMING_SOON_LABEL');
    expect(normalizedWaitlist).toContain(
      'Use your provider accounts on supported ${BYOK_RELEASE_LABEL} releases with visible labels.',
    );
    expect(waitlistForm).not.toContain('var(--teal, #2eb88a)');
    expect(waitlistForm).toContain('var(--agi-success)');
  });

  it('does not imply public Web or Mobile BYOK chat', () => {
    const byok = readWebFile('app/byok/page.tsx');
    const pricingEn = readWebFile('../../packages/ui/i18n/locales/en/pricing.json');
    const pricingEs = readWebFile('../../packages/ui/i18n/locales/es/pricing.json');
    const normalized = byok.replace(/\s+/g, ' ');

    expect(byok).not.toContain('Web and mobile use explicit consent before sending a prompt');
    expect(normalized).toContain('Bring your own API keys to AGI {BYOK_SURFACES.label}');
    expect(normalized).toContain('{BYOK_SURFACES.exclusion}');
    expect(pricingEn).not.toContain('Available on every surface');
    expect(pricingEs).not.toContain('Disponible en todas las superficies');
  });

  it('keeps developer sessions out of cloud conversation continuity claims', () => {
    const upgradeWelcome = readWebFile('app/billing/UpgradeWelcome.tsx');
    const faq = readWebFile('app/faq/page.tsx');
    const normalizedUpgradeWelcome = upgradeWelcome.replace(/\s+/g, ' ');

    expect(upgradeWelcome).not.toContain('Same account, same conversations');

    expect(normalizedUpgradeWelcome).toContain(
      "label: 'Developer sessions', surfaces: ['CLI', 'VS Code'], note: 'Scoped to the workspace you run them in.',",
    );
    expect(normalizedUpgradeWelcome).toContain(
      "label: 'Same account, same chats', surfaces: ['Web', 'Mobile', 'Desktop'],",
    );
    const continuityGroup =
      /surfaces: \[([^\]]*)\], note: 'Cloud conversations follow your signed-in account\.'/.exec(
        normalizedUpgradeWelcome,
      );
    expect(continuityGroup?.[1]).toBeDefined();
    expect(continuityGroup?.[1]).not.toMatch(/CLI|VS Code/);
    expect(faq).toContain(
      'Moving between Local, BYOK, and managed Cloud is not an ordinary model switch',
    );
  });

  it('does not advertise shipped BYOK or Team billing as private-beta access', () => {
    const byokSetup = readWebFile('app/docs/byok-env/page.tsx');
    const apiDocs = readWebFile('app/api-docs/page.tsx');
    const waitlist = readWebFile('app/waitlist/page.tsx');
    const waitlistModal = readWebFile('features/marketing/components/WaitlistModal.tsx');
    const publicWaitlistForm = readWebFile('features/marketing/components/PublicWaitlistForm.tsx');
    const webByokSettings = readWebFile('app/settings/byok/page.tsx');

    expect(byokSetup).not.toContain('Private-beta key entry');
    expect(byokSetup).not.toContain(
      'UI key entry, OS-keychain write, and revoke-all are private-beta',
    );
    expect(byokSetup).not.toContain('Desktop reads from OS keychain');
    expect(byokSetup).toContain('Settings, Models &amp; Keys');
    expect(byokSetup).toContain(
      'Tauri Desktop encrypts provider keys in local application storage',
    );
    expect(apiDocs).not.toContain('SSO &amp; org-seat early access');
    expect(apiDocs).toContain('Enterprise SSO early access');
    expect(waitlist).not.toContain('Team is already live at /pricing');
    expect(waitlistModal).not.toContain('Team has self-serve per-seat checkout');
    expect(publicWaitlistForm).not.toContain('when AGI Cloud access opens');
    expect(publicWaitlistForm).toContain('when the Enterprise program opens');
    expect(webByokSettings).not.toContain('Managed key vault');
    expect(webByokSettings).not.toContain('Request hosted key vault access');
    expect(webByokSettings).toContain('not per-account Web BYOK');
  });

  it('does not promise unverified contact or enterprise sales guarantees', () => {
    const contact = readWebFile('app/contact/page.tsx');
    const sales = readWebFile('app/contact-sales/page.tsx');
    const pricing = readWebFile('../../packages/ui/i18n/locales/en/pricing.json');
    const matrix = readWebFile('lib/marketing-constants.ts');

    expect(contact).not.toContain('Sent.');
    expect(contact).not.toContain('one business day');
    expect(contact).toContain('Email draft opened.');
    expect(sales).not.toContain('one business day');
    expect(sales).not.toContain('named SLA');
    expect(sales).not.toContain('What controls do you need on day one');
    expect(pricing).not.toContain('negotiated SLA');
    expect(matrix).not.toContain('Negotiated SLA');
  });

  it('keeps W02 public feature pages out of internal planning voice', () => {
    const files = [
      'app/agi-code/page.tsx',
      'app/features/artifacts/page.tsx',
      'app/features/deep-research/page.tsx',
      'app/features/memory/page.tsx',
      'app/features/projects/page.tsx',
    ];
    const forbidden = [
      'The page should',
      'What the ads should',
      'Risk to avoid',
      'Demos should',
      'should advertise',
      'Use this page',
      'Do not imply',
      'Do not claim',
      'What to promise',
      'What project pages should',
      'launch-page must',
      'AGI should',
    ];

    for (const file of files) {
      const source = readWebFile(file);

      for (const phrase of forbidden) {
        expect(source, `${file} contains internal phrase: ${phrase}`).not.toContain(phrase);
      }
    }
  });

  it('does not expose internal skill environment variables on public skills routes', () => {
    const source = readWebFile('app/skills/page.tsx');

    expect(source).not.toContain('Configure the SKILLS_LAYERS environment variable');
  });

  it('keeps React Query devtools opt-in for local public demos', () => {
    const queryClient = readWebFile('shared/stores/query-client.ts');
    const envExample = readWebFile('.env.example');
    const nextConfig = readWebFile('next.config.ts');

    expect(queryClient).toContain('NEXT_PUBLIC_ENABLE_REACT_QUERY_DEVTOOLS');
    expect(queryClient).toContain('!ENABLE_REACT_QUERY_DEVTOOLS');
    expect(envExample).toContain('NEXT_PUBLIC_ENABLE_REACT_QUERY_DEVTOOLS=false');
    expect(nextConfig).toContain('devIndicators: false');
  });

  it('presents managed cloud as open by default, not waitlist-gated (WEB-12)', () => {
    const home = [
      'features/marketing/components/MarketingLanding.tsx',
      'features/marketing/components/landing/LandingPage.tsx',
      'features/marketing/components/landing/landing-content.ts',
    ]
      .map(readWebFile)
      .join('\n');

    expect(home).not.toContain('Join the Waitlist');
    expect(home).not.toContain('Private beta via waitlist');
    expect(home).not.toContain('Account & Cloud waitlist');
    expect(home).toContain('Sign in and start, no waitlist');
  });

  it('does not claim managed cloud is waitlist/invite-only on the waitlist page (WEB-12)', () => {
    const waitlist = readWebFile('app/waitlist/page.tsx');

    expect(waitlist).not.toContain('Managed cloud remains waitlist-only');
    expect(waitlist).not.toContain('rolling out by invite');
    expect(waitlist).not.toContain('private beta');
    expect(waitlist).toContain('open by default');
    expect(waitlist).toContain('Team');
  });

  it('chat upgrade dialog presents managed cloud as open by default, not waitlist-gated (WEB-12 / PA-1)', () => {
    const dialog = readWebFile('features/chat/components/dialogs/UpgradePlanDialog.tsx');

    expect(dialog).not.toContain('open by waitlist invite');
    expect(dialog).not.toContain('invite-only');
    expect(dialog).not.toContain('Join waitlist');
    expect(dialog).not.toContain('account-gated');
    expect(dialog).not.toContain('Current plan');
    expect(dialog).toContain('Upgrade to');
    expect(dialog).toContain('open by default');
    expect(dialog).toContain('onUpgrade');
  });

  it('retires the cloud-upgrade waitlist email-capture dialog from the chat flow (PA-1)', () => {
    expect(() =>
      readWebFile('features/chat/components/dialogs/CloudUpgradeWaitlistDialog.tsx'),
    ).toThrow();
    const chatPage = readWebFile('features/chat/pages/WebChatPage.tsx');
    expect(chatPage).not.toContain('CloudUpgradeWaitlistDialog');
    expect(chatPage).not.toContain('onOpenWaitlist');
  });

  it('does not claim managed cloud is invite-only/unavailable across product pages (WEB-12)', () => {
    const pages = [
      'app/faq/page.tsx',
      'app/chrome-extension/page.tsx',
      'app/press/page.tsx',
      'app/signup/page.tsx',
      'app/agi-code/page.tsx',
    ];
    for (const page of pages) {
      const src = readWebFile(page);
      expect(src, `${page} must not say cloud is invite-only`).not.toContain('Cloud by invite');
      expect(src, `${page} must not say cloud stays invite-only`).not.toContain(
        'AGI Cloud stays invite-only',
      );
      expect(src, `${page} must not claim nothing is GA`).not.toContain(
        'Nothing is generally available yet',
      );
      expect(src, `${page} must not say managed compute is invite-only`).not.toContain(
        'Managed compute opens by invite only',
      );
    }
    expect(readWebFile('app/faq/page.tsx')).toContain('open by default');
  });

  it('reframes marketing-constants POSITIONING away from cloud-by-invite (PA-5)', () => {
    const matrix = readWebFile('lib/marketing-constants.ts');

    expect(matrix).not.toContain('Cloud by invite');
    expect(matrix).not.toContain('Higher hosted cloud is invite-only');
    expect(matrix).not.toContain('Hosted web trial. Local and BYOK for serious work.');
    expect(matrix).toContain('open by default, not invite-only');
  });

  it('keeps the teams page metadata on managed cloud, not cloud-by-invite (PA-5)', () => {
    const teams = readWebFile('app/teams/page.tsx');

    expect(teams).not.toContain('invite-only managed cloud');
    expect(teams).not.toContain('Cloud · by invite');
    expect(teams).not.toContain('AGI Cloud invite');
    expect(teams).toContain('integrations on managed cloud');
    expect(teams).toContain('Cloud · hosted by us');
  });

  it('does not call managed cloud private-beta/waitlist-to-use on the pricing page (PA-5)', () => {
    const en = readWebFile('../../packages/ui/i18n/locales/en/pricing.json');
    const es = readWebFile('../../packages/ui/i18n/locales/es/pricing.json');
    const layout = readWebFile('app/pricing/layout.tsx');

    expect(en).not.toContain('AGI Cloud, private beta');
    expect(en).not.toContain('private beta');
    expect(en).not.toContain('Scale by invite');
    expect(en).not.toContain('open by waitlist invite');
    expect(en).toContain('public alpha');
    expect(es).not.toContain('beta privada');
    expect(es).not.toContain('por invitación');
    expect(es).toContain('alfa pública');
    expect(layout).not.toContain('open by waitlist invite');
    expect(layout).toContain('public alpha');
  });

  it('describes web search as ambient, not a manual toggle the composer does not have (DOCS-14)', () => {
    const aiChat = readWebFile('app/features/ai-chat/page.tsx');
    const deepResearch = readWebFile('app/features/deep-research/page.tsx');
    const composer = readWebFile('features/chat/components/Composer/ChatComposerNew.tsx');

    expect(composer, 'web search must still be derived from the resolved model').toContain(
      'setComposerToggles({ webSearchEnabled: modelSupportsSearch })',
    );
    expect(composer, 'the composer face carries no standing search glyph').not.toContain(
      'data-testid="web-search-indicator"',
    );

    for (const [file, source] of [
      ['app/features/ai-chat/page.tsx', aiChat],
      ['app/features/deep-research/page.tsx', deepResearch],
    ] as const) {
      const normalized = source.replace(/\s+/g, ' ');

      expect(normalized, `${file} must not promise a one-tap search toggle`).not.toMatch(
        /one-tap toggle/i,
      );
      expect(normalized, `${file} must not tell users to turn search on`).not.toMatch(
        /turn (on )?search( on)?/i,
      );
      expect(normalized, `${file} must describe search as model-driven`).toContain(
        'Search-capable models reach the live web on their own',
      );
    }

    expect(aiChat.replace(/\s+/g, ' ')).toContain(
      'The composer states whether search is on for the model you picked',
    );
    expect(deepResearch.replace(/\s+/g, ' ')).toContain('the composer states whether search is on');

    const supportArticles = readWebFile('lib/support/static-data.ts');

    expect(
      supportArticles,
      'the web-search help article must not send users to a toolbar control that was removed',
    ).not.toMatch(/enable web search in the chat toolbar/i);
    expect(supportArticles, 'the web-search help article must describe ambient search').toContain(
      'Search-capable models reach the live web on their own',
    );
    expect(supportArticles).toContain('the composer states whether search is on');
  });

  it('never claims cloud access is invite-only anywhere the web surface ships (PA-5)', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(WEB_ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (!SKIPPED_SOURCE_DIRS.has(entry.name) && !entry.name.startsWith('.')) walk(rel);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name) || /\.(test|spec)\.tsx?$/.test(entry.name)) continue;
        if (/Cloud access is currently invite-only/.test(readWebFile(rel))) offenders.push(rel);
      }
    };
    for (const root of ['app', 'features', 'shared', 'lib', 'content']) walk(root);
    expect(offenders, 'managed cloud is open by default, not invite-only').toEqual([]);
  });
});
