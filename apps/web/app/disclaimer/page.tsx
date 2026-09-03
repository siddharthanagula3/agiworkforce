import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { CONTACT_EMAIL, LEGAL_ENTITY, contactMailto } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Disclaimer',
  description:
    'What AGI output is and is not: accuracy limits, professional advice, and third-party models.',
  path: '/disclaimer',
});

export default function DisclaimerPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-disclaimer-title"
          eyebrow="Legal"
          title="Disclaimer."
          lede="AGI generates text, code, and files with language models. Model output can be wrong, out of date, or confidently invented. Check anything you intend to rely on."
          ctas={[]}
        />

        <Section id="not-verified" labelledBy="agi-disclaimer-verified-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-disclaimer-verified-title">
              Output is not verified.
            </h2>
            <Prose>
              Responses are produced statistically, not retrieved from a checked record. A model can
              state a false fact in the same tone it states a true one, cite a source that does not
              say what it is claimed to say, or produce code that runs and is still wrong. Where a
              response includes citations or search results, the underlying pages are third-party
              content we do not control or endorse.
            </Prose>
            <Prose>
              You are responsible for reviewing output before acting on it, publishing it, or
              putting it into production.
            </Prose>
          </Stack>
        </Section>

        <Section id="not-advice" labelledBy="agi-disclaimer-advice-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-disclaimer-advice-title">
              Not professional advice.
            </h2>
            <Prose>
              Nothing AGI produces is legal, medical, financial, tax, or other regulated
              professional advice, and using it does not create a professional relationship of any
              kind. For a decision with legal, health, or financial consequences, consult someone
              qualified and licensed in the relevant jurisdiction.
            </Prose>
          </Stack>
        </Section>

        <Section id="providers" labelledBy="agi-disclaimer-providers-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-disclaimer-providers-title">
              Third-party models and providers.
            </h2>
            <Prose>
              AGI routes requests to models operated by third parties. Their availability,
              behaviour, and results can change without notice, and a model named in the interface
              may be updated or retired by its provider. Provider names and marks belong to their
              respective owners and their appearance here does not imply endorsement.
            </Prose>
            <Prose>
              When you connect a tool or bring your own key, that provider&rsquo;s own terms govern
              what it does with your data. See the{' '}
              <Link href="/privacy" className="agi-ds-link">
                privacy policy
              </Link>{' '}
              for how the trust boundaries differ.
            </Prose>
          </Stack>
        </Section>

        <Section id="availability" labelledBy="agi-disclaimer-availability-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-disclaimer-availability-title">
              Availability.
            </h2>
            <Prose>
              Features marked alpha or beta are unfinished, may fail or stall, and can change or be
              withdrawn. Current service state is published on{' '}
              <Link href="/status" className="agi-ds-link">
                the status page
              </Link>
              .
            </Prose>
          </Stack>
        </Section>

        <Section id="fit" labelledBy="agi-disclaimer-fit-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-disclaimer-fit-title">
              How this fits the rest.
            </h2>
            <Prose>
              This page explains the limits of the output. The warranty disclaimers and limitation
              of liability that govern your use of the service are in the{' '}
              <Link href="/terms" className="agi-ds-link">
                terms of service
              </Link>
              , and what you may do with AGI is in the{' '}
              <Link href="/acceptable-use" className="agi-ds-link">
                acceptable use policy
              </Link>
              . Where this page and the terms differ, the terms control.
            </Prose>
            <Prose>
              Questions about anything here go to{' '}
              <a href={contactMailto('Disclaimer question')} className="agi-ds-link">
                {CONTACT_EMAIL}
              </a>
              . {LEGAL_ENTITY} publishes this page as guidance, not as a substitute for the terms.
            </Prose>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
