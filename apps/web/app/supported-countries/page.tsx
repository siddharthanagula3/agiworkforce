import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { SELECTABLE_LANGUAGES } from '@agiworkforce/i18n/languages';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Ledger,
  Prose,
  Section,
  Stack,
  type LedgerRow,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import {
  CANONICAL_POLICY_ROUTES,
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  LEGAL_ENTITY,
  LEGAL_ENTITY_DESCRIPTOR,
  POLICY_LAST_UPDATED,
  contactMailto,
} from '@/lib/legal-constants';
import { PolicyVersionsLink } from '@shared/components/legal/PolicyVersionsLink';
import { surfaceAvailabilitySummary } from '@/lib/surface-status';

const INTERFACE_LANGUAGES = new Intl.ListFormat('en', { type: 'conjunction' }).format(
  SELECTABLE_LANGUAGES.map((language) => language.name),
);

export const metadata = buildMetadata({
  title: 'Supported countries and regions',
  description:
    'Where AGI Workforce is offered, where United States sanctions law excludes it, what is the same in every country, and the languages the interface ships in.',
  path: CANONICAL_POLICY_ROUTES.supportedCountries,
});

const BY_PLACE: readonly LedgerRow[] = [
  {
    label: 'The Free plan',
    value:
      'The same in every country. Nothing in its limits reads where you are, and there is no country-specific version of it.',
  },
  {
    label: 'Paid plans',
    value:
      'Opening in stages. An upgrade needs an access code or a place on the upgrade waitlist, wherever you are.',
  },
  {
    label: 'Apps',
    value: surfaceAvailabilitySummary(),
  },
  {
    label: 'Connectors',
    value:
      'Connectors are coming soon and cannot be connected yet, in any country. When they open, two are limited to the United States: HealthEx, which reads your own health records, and Bank accounts, which reads your own balances and transactions. A request to connect either from another country is refused with a message that says so.',
  },
  {
    label: 'Where your data is kept',
    value:
      'Our hosting is in the United States, whichever country you use AGI from. We do not offer data residency in the EU, the UK, or India. The model providers and other companies that handle data for us, and their regions, are listed at /subprocessors.',
  },
];

export default function SupportedCountriesPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-supported-countries-title"
          eyebrow="Legal"
          title="Supported countries and regions."
          lede={
            <>
              AGI Workforce is offered in every country and territory, except where United States
              sanctions law bars {LEGAL_ENTITY} from offering it. This page says what that means,
              what is the same everywhere, and what is not. Last updated:{' '}
              {POLICY_LAST_UPDATED.supportedCountries}.{' '}
              <PolicyVersionsLink policy="supportedCountries" />
            </>
          }
          ctas={[]}
        />

        <Section id="offered" labelledBy="agi-supported-countries-offered-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-supported-countries-offered-title">
              Where it is offered.
            </h2>
            <Prose>
              We do not publish a list of supported countries, because sign-up is not limited to a
              list. You can create an account from any country that United States sanctions and
              export-control law does not close to us. That includes the European Economic Area, the
              United Kingdom, and India.
            </Prose>
            <Prose>
              Being able to open this site or create an account does not mean the service is lawful
              to use where you are. Section 02 of the{' '}
              <Link href={CANONICAL_POLICY_ROUTES.terms} className="agi-ds-link">
                terms
              </Link>{' '}
              asks you not to use AGI if the laws of your country, or of the United States, bar you
              from doing so. The same section sets the age rules.
            </Prose>
          </Stack>
        </Section>

        <Section id="excluded" labelledBy="agi-supported-countries-excluded-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-supported-countries-excluded-title">
              Where it is not offered.
            </h2>
            <Prose>
              {LEGAL_ENTITY} is {LEGAL_ENTITY_DESCRIPTOR}, so United States export control and
              economic sanctions law binds it wherever you are. Section 13 of the{' '}
              <Link href={CANONICAL_POLICY_ROUTES.terms} className="agi-ds-link">
                terms
              </Link>{' '}
              says you may not use AGI if you are located in an embargoed territory or are a person
              on a restricted-party list. We do not print the list of places here. The United States
              government sets it and changes it, and its own published lists are the source.
            </Prose>
            <Prose>
              <strong>What you see from one of those places.</strong> The same pages as anyone else.
              This site has no page that turns a visitor away by country for sanctions reasons, so a
              page that loads is not permission to use the service. Where the law requires it, the
              terms let us suspend an account that is used from an embargoed territory or by a
              restricted person.
            </Prose>
          </Stack>
        </Section>

        <Section id="europe" labelledBy="agi-supported-countries-europe-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-supported-countries-europe-title">
              The European Economic Area and the United Kingdom.
            </h2>
            <Prose>
              Sign-up is open in the European Economic Area and in the United Kingdom.{' '}
              <strong>
                We have not appointed a representative in the European Union or in the United
                Kingdom.
              </strong>{' '}
              The law asks a company outside those places that offers a service to people there to
              appoint one, so this is an obligation we have not met. The current position, and where
              to send a privacy request in the meantime, is on the{' '}
              <Link href={CANONICAL_POLICY_ROUTES.euRepresentative} className="agi-ds-link">
                EU representative page
              </Link>
              . Your rights are not reduced by the gap.
            </Prose>
            <Prose>
              The product has a switch that can refuse visitors from the European Economic Area with
              a page that reads &ldquo;Not available in your region&rdquo;. It is off unless we turn
              it on, and our decision is to keep the European Economic Area open. If that changes,
              this page will say so.
            </Prose>
          </Stack>
        </Section>

        <Section id="by-place" labelledBy="agi-supported-countries-by-place-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-supported-countries-by-place-title">
              What is the same everywhere, and what is not.
            </h2>
            <Ledger caption="What depends on your country" rows={BY_PLACE} />
            <Prose size="sm">
              India has its own privacy notice at{' '}
              <Link href={CANONICAL_POLICY_ROUTES.indiaPrivacy} className="agi-ds-link">
                /privacy/india
              </Link>
              . Data processing terms for the European Economic Area and the United Kingdom are in
              the{' '}
              <Link href={CANONICAL_POLICY_ROUTES.dpa} className="agi-ds-link">
                data processing addendum
              </Link>
              .
            </Prose>
          </Stack>
        </Section>

        <Section id="languages" labelledBy="agi-supported-countries-languages-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-supported-countries-languages-title">
              Languages.
            </h2>
            <Prose>
              The interface can be set to {INTERFACE_LANGUAGES}. A language is offered only once its
              translation is complete and reviewed, so the list is short. These policy pages and the
              help centre are published in English.
            </Prose>
            <Prose>
              The language you write to a model in is a separate matter. It depends on the model you
              pick, and we do not test or promise any particular language.
            </Prose>
          </Stack>
        </Section>

        <Section id="contact" labelledBy="agi-supported-countries-contact-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-supported-countries-contact-title">
              Questions about your country.
            </h2>
            <Prose>
              If you are not sure whether you may use AGI where you are, or something on this page
              looks wrong for your country, write to{' '}
              <a href={contactMailto(CONTACT_SUBJECTS.countryAvailability)} className="agi-ds-link">
                {CONTACT_EMAIL}
              </a>
              . We cannot give you legal advice about your own country&rsquo;s law.
            </Prose>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
