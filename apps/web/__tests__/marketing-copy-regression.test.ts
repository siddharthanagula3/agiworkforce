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

    // /cli only advertises the install path documented in apps/cli/README.md.
    // The brew tap and install.sh script have no repo backing for the CLI page.
    expect(cliInstall).toContain('cargo install --path apps/cli --bin agi');
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
    expect(normalizedWaitlist).toContain('rolling out by invite');
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
});
