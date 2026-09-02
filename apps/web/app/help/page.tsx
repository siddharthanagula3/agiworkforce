import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Button, ButtonRow, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { LinkGrid } from '@/features/marketing/components/pages/features/shared';
import {
  BYOK_SURFACES,
  DESKTOP_LOCAL_RUNTIMES,
  MARKETING,
  SURFACE_STATUS,
} from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'Help: quick links into the product',
  description: 'Quick links into the parts of the product most people ask about.',
  path: '/help',
});

export default function HelpPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-help-title"
          eyebrow="Help"
          title="Get unstuck, fast."
          lede="The six things people ask about most, each one link away. For anything else, email contact@agiworkforce.com. A real human reads it."
          ctas={[]}
        />

        <Section id="common" labelledBy="agi-help-common-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-help-common-title">
              Start with the page that answers it.
            </h2>
            <LinkGrid
              items={[
                {
                  meta: 'Install',
                  title: 'Get the apps',
                  href: '/download',
                  body: 'Desktop installer routes for macOS, Windows, and Linux open as release assets become available. The CLI page carries the current agi install guide.',
                },
                {
                  meta: 'BYOK',
                  title: 'Add your API key',
                  href: '/byok',
                  body: `Bring your own provider keys on ${BYOK_SURFACES.label}. Desktop and the CLI have published releases; the VS Code extension is ${SURFACE_STATUS.vscode.toLowerCase()}. ${BYOK_SURFACES.exclusion} The key stays in the local runtime and requests go straight to your provider.`,
                },
                {
                  meta: 'Local',
                  title: 'Run offline',
                  href: '/local',
                  body: `Desktop supports ${DESKTOP_LOCAL_RUNTIMES.label}; CLI supports its documented local integrations. After setup, Local inference is offline-capable with no AGI key or quota.`,
                },
                {
                  meta: 'Models',
                  title: 'Switch models',
                  href: '/providers',
                  body: `${MARKETING.models.display} models across ${MARKETING.providers.display} providers, switchable mid-conversation.`,
                },
                {
                  meta: 'Terminal',
                  title: 'Use the CLI',
                  href: '/cli',
                  body: 'A Rust-native developer agent: resumable sessions, sandboxed execution, offline-capable.',
                },
                {
                  meta: 'Plans',
                  title: 'See pricing',
                  href: '/pricing',
                  body: 'Local and BYOK are free. Managed cloud is open by default (metered). Current details live on the pricing page.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="more" labelledBy="agi-help-more-title" rule ground="2">
          <Stack>
            <h2 className="agi-ds-h2" id="agi-help-more-title">
              Still stuck? Ask a human.
            </h2>
            <ButtonRow>
              <Button href="/faq">Read the FAQ</Button>
              <Button href="/support" variant="secondary">
                Get support
              </Button>
              <Button href="mailto:contact@agiworkforce.com" variant="secondary">
                Email us
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
