import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { CATALOG_AS_OF, MARKETING, SURFACE_STATUS } from '../../lib/marketing-constants';
import {
  FOUNDER_NAME,
  FOUNDER_ROLE,
  CONTACT_EMAIL,
  GOVERNING_LAW,
  LEGAL_ENTITY,
  LEGAL_ENTITY_DESCRIPTOR,
  REGISTERED_AGENT_ADDRESS,
  contactMailto,
} from '../../lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Press: the fact sheet',
  description: `Press fact sheet for AGI: what it is, who builds it, which surfaces have shipped, and what we do not claim. Product facts as of ${CATALOG_AS_OF}.`,
  path: '/press',
});

const PRODUCT_FACTS: { label: string; value: string }[] = [
  {
    label: 'What it is',
    value:
      'An AI assistant and agent platform: chat, code, research, files, projects, artifacts, tools and connectors, memory, and scheduled work.',
  },
  {
    label: 'Available now',
    value: `AGI Web, in any browser · AGI Desktop, ${SURFACE_STATUS.desktop}, with installability verified per platform · AGI CLI, ${SURFACE_STATUS.cli.toLowerCase()}, macOS, Linux and Windows`,
  },
  {
    label: 'Built, not yet released',
    value:
      'AGI Mobile (iOS, Android) · AGI for VS Code · AGI for Chrome. All three exist in the repository with release workflows, and none has a published release. They are not installable from any store today.',
  },
  {
    label: 'Where inference runs',
    value:
      'Three separate routes the user picks between: Local (models on the user’s own hardware, works offline), BYOK (the user’s own provider key, traffic goes directly to that provider), and AGI managed cloud (hosted and metered by AGI). Work does not move between routes without an explicit, labeled action.',
  },
  {
    label: 'Managed cloud status',
    value:
      'Open by default since 2026-06-27. No waitlist and no invite. It is not generally available.',
  },
  {
    label: 'Model catalog',
    value: `${MARKETING.models.count} models across ${MARKETING.providers.count} provider integrations, as of ${CATALOG_AS_OF}. The catalog is a versioned, dated file in the repository rather than a marketing figure.`,
  },
  {
    label: 'Model access by plan',
    value:
      'Tiered and enforced in shared code, not uniform: an economy roster, further models added on Pro, and frontier models on Max. A plan cannot reach a model above its tier, so lower plans do not get frontier access.',
  },
  {
    label: 'Pricing posture',
    value:
      'Local and BYOK cost nothing to AGI: users pay their provider directly, or nothing at all when running locally. Managed cloud is metered. Team is priced per seat, with current checkout availability shown on Pricing; Enterprise is sales-assisted.',
  },
];

const COMPANY_FACTS: { label: string; value: string }[] = [
  { label: 'Legal entity', value: `${LEGAL_ENTITY}, ${LEGAL_ENTITY_DESCRIPTOR}` },
  { label: 'Registered agent', value: REGISTERED_AGENT_ADDRESS },
  { label: 'Governing law', value: GOVERNING_LAW.replace(/^the /, '') },
  { label: 'Founder', value: `${FOUNDER_NAME}, ${FOUNDER_ROLE}` },
  { label: 'Ownership', value: 'Independent and privately held. No outside funding is announced.' },
  { label: 'Press contact', value: CONTACT_EMAIL },
];

const NOT_CLAIMED: string[] = [
  'No security certifications. SOC 2 and ISO 27001 are planned with no audit report and no date; HIPAA workflows are not offered. The trust page carries the qualified status.',
  'No named customers, logos, or testimonials, and no case studies. We publish those only with written permission, and we have none cleared to publish.',
  'No usage, revenue, headcount, or funding figures.',
  'No uptime or availability record. The SLA page states planned targets, not measured history.',
  'No general availability claim for managed cloud.',
];

export default function PressPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-press-title"
          eyebrow="Press"
          title="Facts you can publish without checking."
          lede={`Everything on this page is verified against the product source, and anything that can change is dated. Where we have nothing to show (customers, certifications, usage numbers), this page says so plainly instead of leaving a gap. Product facts as of ${CATALOG_AS_OF}.`}
          ctas={[
            { href: contactMailto('Press enquiry'), label: 'Email the press contact' },
            { href: '/trust', label: 'See the trust posture', variant: 'secondary' },
          ]}
        />

        <Section id="boilerplate" labelledBy="agi-press-boiler-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-press-boiler-title">
                Two lengths, ready to paste.
              </h2>
              <Prose>
                Both are written to be accurate on their own, out of context. Please use them as-is
                rather than paraphrasing the status of a surface.
              </Prose>
            </div>
            <Stack gap="loose">
              <Stack gap="tight">
                <h3 className="agi-ds-h3">Short</h3>
                <Prose size="sm">
                  AGI is an AI assistant that works across the web, desktop, and terminal, and lets
                  you choose whether each request runs on your own hardware, on your own provider
                  key, or on AGI&rsquo;s hosted service.
                </Prose>
              </Stack>
              <Stack gap="tight">
                <h3 className="agi-ds-h3">Long</h3>
                <Prose size="sm">
                  AGI is an AI assistant and agent platform built by {LEGAL_ENTITY},{' '}
                  {LEGAL_ENTITY_DESCRIPTOR}. It spans six surfaces (web, desktop, mobile, command
                  line, VS Code, and Chrome), of which the web app, desktop app, and CLI have
                  shipped. Its distinguishing design choice is that the user selects where inference
                  happens: locally on their own hardware, through their own provider API key, or on
                  AGI&rsquo;s managed cloud. Those three routes are separate trust boundaries, and
                  work does not move between them without an explicit, labeled action.
                </Prose>
              </Stack>
            </Stack>
          </Stack>
        </Section>

        <Section id="product" labelledBy="agi-press-product-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-press-product-title">
                The product, stated precisely.
              </h2>
              <Prose>
                &ldquo;Available now&rdquo; means there is a published release. &ldquo;Built, not
                yet released&rdquo; means the code exists and nothing has shipped. Please do not
                describe those three as products readers can get.
              </Prose>
            </div>
            <Ledger caption="Product facts" rows={PRODUCT_FACTS} />
            <Prose size="sm">
              Pricing figures change and are deliberately not restated here. See{' '}
              <Link href="/pricing" className="agi-ds-link">
                the pricing page
              </Link>{' '}
              for current numbers.
            </Prose>
          </Stack>
        </Section>

        <Section id="company" labelledBy="agi-press-company-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-press-company-title">
              Who builds it.
            </h2>
            <Ledger caption="Company facts" rows={COMPANY_FACTS} />
          </Stack>
        </Section>

        <Section id="not-claimed" labelledBy="agi-press-notclaimed-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-press-notclaimed-title">
                The things we cannot back up.
              </h2>
              <Prose>
                If you are checking a claim made about AGI somewhere else, and it appears on this
                list, it did not come from us.
              </Prose>
            </div>
            <Ledger
              caption="Not claimed"
              rows={NOT_CLAIMED.map((item, index) => ({ label: `${index + 1}`, value: item }))}
            />
          </Stack>
        </Section>

        <Section id="assets" labelledBy="agi-press-assets-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-press-assets-title">
                Logo files.
              </h2>
              <Prose>
                The AGI mark, served directly from this site. Please use it unmodified: do not
                recolor, rotate, add effects, or place it on a busy background. The name is written
                &ldquo;AGI&rdquo;, and the company is {LEGAL_ENTITY}.
              </Prose>
            </div>
            <ButtonRow>
              <a href="/logo-512.png" download className="agi-ds-btn" data-variant="primary">
                AGI mark: PNG, 512&times;512
              </a>
              <a href="/logo-192.png" download className="agi-ds-btn" data-variant="secondary">
                AGI mark: PNG, 192&times;192
              </a>
              <a href="/og-image.svg" download className="agi-ds-btn" data-variant="secondary">
                Social card: SVG
              </a>
            </ButtonRow>
          </Stack>
        </Section>

        <Section id="contact" labelledBy="agi-press-contact-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-press-contact-title">
                Interviews, demos, and fact-checks.
              </h2>
              <Prose>
                Email {CONTACT_EMAIL} with your outlet, deadline, and angle. If you are checking a
                specific number before you publish, say so in the subject line and we will confirm
                or correct it.
              </Prose>
            </div>
            <ButtonRow>
              <Button href={contactMailto('Press enquiry')}>Email the press contact</Button>
              <Button href="/about" variant="secondary">
                Read about AGI
              </Button>
              <Button href="/trust" variant="secondary">
                See the trust posture
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
