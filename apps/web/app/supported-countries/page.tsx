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
import {
  UNSERVED_COUNTRIES,
  UNSERVED_SUBDIVISIONS,
  isUnderUsSanctions,
} from '@agiworkforce/compliance/service-regions';

const listInEnglish = (names: readonly string[]) =>
  new Intl.ListFormat('en', { type: 'conjunction' }).format(names);

const INTERFACE_LANGUAGES = listInEnglish(SELECTABLE_LANGUAGES.map((language) => language.name));

const UNSERVED_PLACES = [...UNSERVED_COUNTRIES, ...UNSERVED_SUBDIVISIONS];

const placeNames = (sanctioned: boolean) =>
  listInEnglish(
    UNSERVED_PLACES.filter((place) => isUnderUsSanctions(place) === sanctioned)
      .map((place) => place.name)
      .sort((first, second) => first.localeCompare(second, 'en')),
  );

const NOT_OFFERED: readonly LedgerRow[] = [
  { label: 'Barred by United States sanctions', value: `${placeNames(true)}.` },
  { label: 'Not offered', value: `${placeNames(false)}.` },
];

export const metadata = buildMetadata({
  title: 'Supported countries and regions',
  description:
    'Where AGI Workforce is offered, the countries and regions where it is not, what is the same in every country, and the languages the interface ships in.',
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
              AGI Workforce is offered in every country and territory except the ones listed on this
              page. Some are closed to {LEGAL_ENTITY} by United States sanctions law, and the rest
              are places where we do not offer the service. Last updated:{' '}
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
              You can create an account and use AGI from any country or territory that is not in the
              list below. That includes the European Economic Area, the United Kingdom, and India. A
              territory or dependency of a country where AGI is offered is covered too, such as
              Puerto Rico, Guam, Jersey, Gibraltar or Curaçao.
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
              economic sanctions law binds it wherever you are. We do not offer AGI in these
              countries and regions:
            </Prose>
            <Ledger caption="Countries and regions where AGI is not offered" rows={NOT_OFFERED} />
            <Prose>
              An organisation that is incorporated or headquartered in one of these places, or that
              is majority owned or controlled by people or organisations there, may not use AGI from
              anywhere. Section 13 of the{' '}
              <Link href={CANONICAL_POLICY_ROUTES.terms} className="agi-ds-link">
                terms
              </Link>{' '}
              also bars anyone on a United States restricted-party list.
            </Prose>
            <Prose>
              <strong>What you see from one of those places.</strong> We judge where a request comes
              from by its network address. A page request gets a page that reads &ldquo;Not
              available in your region&rdquo;, and the apps and the API get the same refusal. These
              legal pages, including this one, stay open everywhere. Judging by address is not
              exact: a network address can be placed in the wrong country or region, and for the
              regions of Ukraine it can only be as precise as the address data. If you are refused
              somewhere you should not be, write to us.
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
