import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Button, ButtonRow, Eyebrow, Section, Stack } from '@/features/marketing/components/system';
import { FactGrid, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { CONTACT_EMAIL, contactMailto } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Contact sales',
  description:
    'Reach a real human about AGI Enterprise readiness, security review needs, account rollout, and managed cloud access.',
  path: '/contact-sales',
});

export default function ContactSalesPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-contact-sales-title"
          eyebrow="Contact sales"
          title="Talk to sales."
          lede={
            <>
              One human, one inbox. Email <strong>{CONTACT_EMAIL}</strong> with what you&rsquo;re
              trying to do, how big your team is, and what your security review needs.
            </>
          }
          ctas={[]}
        />

        <Section id="what-to-include" labelledBy="agi-contact-sales-include-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>What to include</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-contact-sales-include-title">
                Tell us this up front.
              </h2>
            </div>
            <FactGrid
              items={[
                {
                  meta: 'Your shape',
                  title: 'Team size and surfaces',
                  body: 'Team size, surfaces (desktop, mobile, web, CLI, extensions), data residency requirements.',
                },
                {
                  meta: 'Your review',
                  title: 'Which controls matter first',
                  body: (
                    <>
                      SSO and SCIM provisioning are implemented and configured by your org owner;
                      audit capture is in place but extracts are supplied under contract; neither
                      per-organization retention windows nor org-wide BYOK enforcement is shipped,
                      and both are handled under contract. The{' '}
                      <a className="agi-ds-link" href="/enterprise">
                        enterprise page
                      </a>{' '}
                      states which is which, row by row.
                    </>
                  ),
                },
                {
                  meta: 'Your timeline',
                  title: 'When you want to be live',
                  body: 'When do you want to be live, and what blockers do you anticipate from procurement or compliance?',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="reach-us" labelledBy="agi-contact-sales-reach-title" rule ground="2">
          <Stack gap="loose">
            <Eyebrow>Reach us</Eyebrow>
            <h2 className="agi-ds-h2" id="agi-contact-sales-reach-title">
              Get a reply, not a ticket number.
            </h2>
            <ButtonRow>
              <Button href={contactMailto()}>Email {CONTACT_EMAIL}</Button>
              <Button href="/enterprise" variant="secondary">
                See what Enterprise includes
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
