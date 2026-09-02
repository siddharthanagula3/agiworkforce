import Link from 'next/link';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Ledger, Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { FounderBlock } from '@/features/marketing/components/pages/company/shared';
import {
  CONTACT_EMAIL,
  FOUNDER_NAME,
  FOUNDER_ROLE,
  LEGAL_ENTITY,
  LEGAL_ENTITY_DESCRIPTOR,
  PRODUCT_NAME,
  contactMailto,
} from '../../lib/legal-constants';

export const metadata = buildMetadata({
  title: `${FOUNDER_NAME}, ${FOUNDER_ROLE}`,
  description: `${FOUNDER_NAME} is ${FOUNDER_ROLE} of ${LEGAL_ENTITY}, the company behind ${PRODUCT_NAME}.`,
  path: '/founder',
});

// Only what can be checked. No headcount, funding, or advisory-board theatre —
// the press page already refuses to claim those, and this page would be the
// obvious place for them to creep back in.
const FACTS: { label: string; value: string }[] = [
  { label: 'Name', value: FOUNDER_NAME },
  { label: 'Role', value: `${FOUNDER_ROLE}, ${LEGAL_ENTITY}` },
  { label: 'Product', value: `${PRODUCT_NAME}, agiworkforce.com` },
  { label: 'Company', value: `${LEGAL_ENTITY}, ${LEGAL_ENTITY_DESCRIPTOR}` },
  { label: 'Ownership', value: 'Independent and privately held. No outside funding announced.' },
  { label: 'Contact', value: CONTACT_EMAIL },
];

export default function FounderPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-founder-title"
          eyebrow="The founder"
          title="Siddhartha Nagula."
          lede={`${FOUNDER_ROLE} of ${LEGAL_ENTITY}, the company behind ${PRODUCT_NAME}. It is built and led by one person. That is stated here rather than implied away with a plural "we", because it is the thing most likely to matter to someone deciding whether to depend on this product.`}
          ctas={[]}
        />

        <Section id="conviction" labelledBy="agi-founder-conviction-title" rule>
          <FounderBlock
            quote={<>&ldquo;You should own the choice of model.&rdquo;</>}
            body={`The person doing the work should decide where it runs and which model answers, not a vendor holding the only key. Local Mode never phones home, BYOK keeps your keys on your own machine, and managed cloud is a choice you make rather than the only door. Every design decision in ${PRODUCT_NAME} follows from that.`}
            name={FOUNDER_NAME}
            role={`${FOUNDER_ROLE}, ${LEGAL_ENTITY}`}
          />
        </Section>

        <Section id="facts" labelledBy="agi-founder-facts-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-founder-facts-title">
              The facts: checkable, and nothing else.
            </h2>
            <Ledger caption="Founder facts" rows={FACTS} />
          </Stack>
        </Section>

        <Section id="contact" labelledBy="agi-founder-contact-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-founder-contact-title">
              The inbox is read by a person.
            </h2>
            <Prose>
              Product feedback, bugs, partnership questions and press all arrive at the same
              address, and it is me reading them. If you are already in the product, the feedback
              control under the composer is faster: it carries the context with it.
            </Prose>
            <Prose>
              <Link href={contactMailto()} className="agi-ds-link">
                {CONTACT_EMAIL}
              </Link>
            </Prose>
            <Prose>
              More on the company at{' '}
              <Link href="/about" className="agi-ds-link">
                About
              </Link>
              , the assets and boilerplate at{' '}
              <Link href="/press" className="agi-ds-link">
                Press
              </Link>
              , and what is deliberately not claimed at{' '}
              <Link href="/trust" className="agi-ds-link">
                Trust
              </Link>
              .
            </Prose>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
