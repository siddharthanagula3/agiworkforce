import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const WEB_ROOT = join(__dirname, '..');

function readWebFile(path: string) {
  return readFileSync(join(WEB_ROOT, path), 'utf8');
}

describe('public marketing copy regressions', () => {
  it('keeps local CLI examples tied to explicit discovered models', () => {
    const source = readWebFile('app/local/page.tsx');
    const getStarted = readWebFile('app/get-started/page.tsx');

    expect(source).toContain('agi models scan');
    expect(source).toContain('agi --provider ollama --model');
    expect(source).toContain('&lt;model&gt;');
    expect(source).toContain('agi --provider lmstudio --model');
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

    // The install.sh script and brew tap have no repo backing; no public page
    // may advertise them as install paths (flagship refactor, 2026-06).
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

    // Coming-soon posture (restructure 2026-07-09): the agi binary is not
    // distributed yet, so the /cli page advertises NO install command at all —
    // not cargo, not the unverified brew tap or curl installer. This supersedes
    // the earlier "only advertise the cargo path" rule.
    expect(cliInstall, 'cli page must show the coming-soon posture').toContain('coming soon');
    expect(
      cliInstall,
      'cli page must not advertise a cargo install while coming soon',
    ).not.toContain('cargo install');
    expect(cliInstall, 'cli page must not advertise the unverified curl installer').not.toContain(
      'install.sh',
    );
    expect(cliInstall, 'cli page must not advertise the unverified brew tap').not.toContain(
      'brew install',
    );
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
    // Managed cloud is public-alpha-open (not invite-only); the page reflects that.
    expect(normalizedWaitlist).toContain('public alpha');
    expect(normalizedWaitlist).toContain('Use your provider accounts on Desktop and CLI');
    expect(waitlistForm).not.toContain('var(--teal, #2eb88a)');
    expect(waitlistForm).toContain('var(--agi-success)');
  });

  it('does not imply public Web or Mobile BYOK chat', () => {
    const byok = readWebFile('app/byok/page.tsx');
    const pricingEn = readWebFile('app/i18n/locales/en/pricing.json');
    const pricingEs = readWebFile('app/i18n/locales/es/pricing.json');
    const normalized = byok.replace(/\s+/g, ' ');

    expect(byok).not.toContain('Web and mobile use explicit consent before sending a prompt');
    expect(normalized).toContain('BYOK lives on Desktop and the CLI');
    expect(normalized).toContain('Web and Mobile don&rsquo;t take provider keys');
    expect(pricingEn).not.toContain('Available on every surface');
    expect(pricingEs).not.toContain('Disponible en todas las superficies');
  });

  it('does not promise unverified contact or enterprise sales guarantees', () => {
    const contact = readWebFile('app/contact/page.tsx');
    const sales = readWebFile('app/contact-sales/page.tsx');
    const pricing = readWebFile('app/i18n/locales/en/pricing.json');
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

  it('presents managed cloud as public-alpha-open, not waitlist-gated (WEB-12)', () => {
    // Managed Cloud is public alpha and open by default (founder decision
    // 2026-06-27, source-of-truth.md). The homepage must NOT claim it is
    // waitlist/invite-only — that is an overclaim against shipped scope.
    const home = readWebFile('app/page.tsx');

    expect(home).not.toContain('Join the Waitlist');
    expect(home).not.toContain('Private beta via waitlist');
    expect(home).not.toContain('Account & Cloud waitlist');
    // The AGI Cloud mode card presents the public-alpha reality.
    expect(home).toContain('Public alpha — sign in and start, no waitlist');
  });

  it('does not claim managed cloud is waitlist/invite-only on the waitlist page (WEB-12)', () => {
    // The /waitlist page is reframed for Team & Enterprise early access — managed
    // cloud itself is public-alpha-open, so the page must not assert it is gated.
    const waitlist = readWebFile('app/waitlist/page.tsx');

    expect(waitlist).not.toContain('Managed cloud remains waitlist-only');
    expect(waitlist).not.toContain('rolling out by invite');
    expect(waitlist).not.toContain('private beta');
    // Reframed truthfully: managed cloud open, list is for Team & Enterprise.
    expect(waitlist).toContain('open by default');
    expect(waitlist).toContain('Team');
  });

  it('chat upgrade dialog presents managed cloud as public-alpha-open, not waitlist-gated (WEB-12 / PA-1)', () => {
    // The in-chat UpgradePlanDialog previously claimed cloud plans were
    // "invite-only"/"open by waitlist invite" and rendered a DEAD disabled
    // "Current plan" button for non-current upgrade tiers (pro/max could not be
    // purchased). After PA-1 it must wire to real checkout with no waitlist copy.
    const dialog = readWebFile('features/chat/components/dialogs/UpgradePlanDialog.tsx');

    // No invite/waitlist framing for managed cloud.
    expect(dialog).not.toContain('open by waitlist invite');
    expect(dialog).not.toContain('invite-only');
    expect(dialog).not.toContain('Join waitlist');
    expect(dialog).not.toContain('account-gated');
    // No dead disabled "Current plan" CTA on a tier that is not the current one.
    expect(dialog).not.toContain('Current plan');
    // Real upgrade CTA + public-alpha truth.
    expect(dialog).toContain('Upgrade to');
    expect(dialog).toContain('public alpha');
    expect(dialog).toContain('onUpgrade');
  });

  it('retires the cloud-upgrade waitlist email-capture dialog from the chat flow (PA-1)', () => {
    // The email-capture "Request upgrade access" dialog implied managed cloud
    // was invite/waitlist-gated. It is removed; the chat page no longer wires it.
    expect(() =>
      readWebFile('features/chat/components/dialogs/CloudUpgradeWaitlistDialog.tsx'),
    ).toThrow();
    const chatPage = readWebFile('features/chat/pages/WebChatPage.tsx');
    expect(chatPage).not.toContain('CloudUpgradeWaitlistDialog');
    expect(chatPage).not.toContain('onOpenWaitlist');
  });

  it('API reference examples use a real catalog model id, not a stale one (WEB-0)', () => {
    // Invariant: model IDs come only from packages/types/src/models.json. The
    // public API docs previously showed "gpt-4" (not in the catalog) — a user
    // copying the example would hit a non-existent model.
    const apiRef = readWebFile('features/pages/ApiReference.tsx');
    expect(apiRef).not.toContain('"gpt-4"');
    expect(apiRef).not.toContain("'gpt-4'");
    expect(apiRef).toContain('gpt-5.4-mini');
  });

  it('does not claim managed cloud is invite-only/unavailable across product pages (WEB-12)', () => {
    // Sweep the public pages that previously asserted managed cloud was
    // waitlist/invite-gated. None may state it is unavailable or invite-only.
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
    // FAQ states the public-alpha reality.
    expect(readWebFile('app/faq/page.tsx')).toContain('public alpha and open by default');
  });

  it('reframes marketing-constants POSITIONING away from cloud-by-invite (PA-5)', () => {
    // Managed cloud is public-alpha-open (founder decision 2026-06-27/28). The
    // shared POSITIONING constants must not present it as invite-only/by-invite.
    const matrix = readWebFile('lib/marketing-constants.ts');

    expect(matrix).not.toContain('Cloud by invite');
    expect(matrix).not.toContain('Higher hosted cloud is invite-only');
    expect(matrix).not.toContain('Hosted web trial. Local and BYOK for serious work.');
    // Trust boundary now states the public-alpha reality.
    expect(matrix).toContain('public alpha');
    expect(matrix).toContain('open by default, not invite-only');
  });

  it('keeps the teams page metadata on public-alpha managed cloud (PA-5)', () => {
    const teams = readWebFile('app/teams/page.tsx');

    expect(teams).not.toContain('invite-only managed cloud');
    expect(teams).not.toContain('Cloud · by invite');
    expect(teams).not.toContain('AGI Cloud invite');
    expect(teams).toContain('public-alpha managed cloud');
    expect(teams).toContain('Cloud · public alpha');
  });

  it('does not call managed cloud private-beta/waitlist-to-use on the pricing page (PA-5)', () => {
    const en = readWebFile('app/i18n/locales/en/pricing.json');
    const es = readWebFile('app/i18n/locales/es/pricing.json');
    const layout = readWebFile('app/pricing/layout.tsx');

    // EN: no private-beta or by-invite framing for managed cloud access.
    expect(en).not.toContain('AGI Cloud, private beta');
    expect(en).not.toContain('private beta');
    expect(en).not.toContain('Scale by invite');
    expect(en).not.toContain('open by waitlist invite');
    expect(en).toContain('public alpha');
    // ES stays in parity and also drops the private-beta framing.
    expect(es).not.toContain('beta privada');
    expect(es).not.toContain('por invitación');
    expect(es).toContain('alfa pública');
    // Pricing metadata no longer claims cloud plans open by waitlist invite.
    expect(layout).not.toContain('open by waitlist invite');
    expect(layout).toContain('public alpha');
  });

  it('reframes the web InviteCodeModal away from invite-only cloud access (PA-5)', () => {
    const modal = readWebFile('components/cloud-bridge/InviteCodeModal.tsx');

    expect(modal).not.toContain('Cloud access is currently invite-only');
    expect(modal).toContain('Managed cloud is open in public alpha');
  });
});
