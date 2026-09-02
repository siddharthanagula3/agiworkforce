import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Button, ButtonRow, Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { NoteList } from '@/features/marketing/components/pages/company/shared';
import { BYOK_SURFACES, DESKTOP_LOCAL_RUNTIMES, MARKETING } from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'FAQ: providers, BYOK, local mode, and security',
  description:
    'Frequently asked questions about providers, BYOK, Local mode, AGI managed cloud, and security.',
  path: '/faq',
});

const QA: { title: string; body: string }[] = [
  {
    title: 'How many providers do you support?',
    body: `${MARKETING.providers.display} provider integrations, including Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot and Zhipu. The CLI can additionally route to a custom OpenAI-compatible endpoint you declare in its own config file, over https or localhost only; Desktop and Web have no setting that points AGI at an arbitrary endpoint, so this is a CLI capability rather than a product-wide one. Desktop Local mode also supports four verified runtimes: ${DESKTOP_LOCAL_RUNTIMES.label}. The in-product catalog is the current source of truth.`,
  },
  {
    title: 'What does BYOK mean here?',
    body: `You bring your own API key on ${BYOK_SURFACES.label}. Keys stay in the local developer or desktop runtime and requests go directly to your provider. Usage is billed by the provider, not by AGI. ${BYOK_SURFACES.exclusion}`,
  },
  {
    title: 'Can I run AGI fully offline?',
    body: 'Yes on Desktop and CLI after a supported local runtime and model are installed. Those Local conversations are not sent to AGI, and Local mode is free; downloading a model may require internet first. Mobile has no published release, so its Local mode is not offered publicly yet.',
  },
  {
    title: 'Can I switch models mid-conversation?',
    body: 'Within the active trust boundary, yes: pick another supported model and the provider label updates before the next request leaves your machine. Moving between Local, BYOK, and managed Cloud is not an ordinary model switch. It requires an explicit fork or continuation with context selection, secret scanning, a payload preview, consent, and a visible destination label. Local content is never silently sent elsewhere.',
  },
  {
    title: 'What does AGI Cloud cost?',
    body: 'AGI managed cloud is open by default: sign in and start, no waitlist. Usage is metered and current plan details live on the pricing page. Local and BYOK remain free. Pricing is also the source of truth for which self-serve checkouts are configured for your region and billing cadence; Team is priced per seat when its checkout is available. Only Enterprise (custom governance, SSO, custom retention) is sales-assisted, with an early-access interest list.',
  },
  {
    title: 'How do I upgrade, downgrade, cancel, or get an invoice?',
    body: 'Start an available self-serve upgrade from Pricing. For a Stripe-billed plan, open Settings, Billing and choose Manage billing to use the Stripe Customer Portal for plan changes, cancellation, payment methods, and invoices; a scheduled cancellation date is shown in Billing after it is recorded. App Store and Google Play subscriptions must be managed in the store that bills them. Operator-provisioned Enterprise plans are handled through your organization. Refund eligibility is described in the Refund Policy.',
  },
  {
    title: 'Do you train on my data?',
    body: 'AGI does not use customer conversation content to train AGI-owned models, and we do not sell your data. Be precise about the part people misread: in managed cloud we send your prompt and attachments to the provider serving the model you selected. MiniMax, Qwen and Zhipu route through OpenRouter, which is also the failover for every other chat model in the catalogue, so content for a model from any provider can pass through it. Those third parties handle that content under their applicable terms and data-use policies, our statement about AGI-owned models is not a promise on their behalf. In BYOK mode your own provider account and terms govern, and in Local mode none of them are contacted. Recipients are listed at /subprocessors.',
  },
  {
    title: 'Who can read my conversations?',
    body: 'In Local mode, nobody but you. They never reach us. In managed cloud we store them, so the honest answer is not nobody: access is limited to people who need it to operate or support the service, and every request is scoped to the account that owns it by two layers of access control. The privacy policy states what those layers are and, more usefully, where each one stops.',
  },
  {
    title: 'Do you sell my data, or use it for ads?',
    body: 'No to both. We do not sell personal data, we do not share it for cross-context behavioural advertising, we run no advertising and we set no advertising cookies. Analytics is opt-in and stays off until you turn it on. The third parties that do receive data, and exactly what each one gets, are listed on the subprocessors page.',
  },
  {
    title: 'How do I delete everything, or get a copy of it?',
    body: 'Both are self-serve in account settings. Export returns your data as a download. Deletion is scheduled 24 hours out and then performed by a daily job that also deletes your identity at our authentication provider. No confirmation email is sent, but cancellation is self-serve too: sign back in and cancel from Settings, Account any time before the 24 hours are up. A short list of things is kept on purpose, and the privacy policy has a table of exactly what and why.',
  },
  {
    title: 'What if I never made an account: can you still delete what you hold?',
    body: 'Yes, but not automatically. An email address you gave a waitlist, or a consent you gave without signing in, is not reachable by account deletion because there is no account to delete, and nothing ages those out on a schedule. Use the request form on the data-rights page and we will remove them.',
  },
  {
    title: 'What happens to my data if I cancel?',
    body: 'Cancelling a subscription does not delete your account or your content. The account continues on the free tier and your data stays until you delete it. If you want it gone, delete the account; if you want a copy first, export it.',
  },
  {
    title: 'Are you GDPR or DPDP compliant?',
    body: 'Those are not badges anyone issues, so a plain yes would be worth nothing. What we publish instead is the working: a per-regime status ledger on the trust page with a date on every line and what would prove it, an India-specific notice under the Digital Personal Data Protection Act, and a security page that lists what we have NOT done alongside what we have. We hold no SOC 2 report and no ISO 27001 certificate, and we say so in the same places we say what we do have.',
  },
  {
    title: 'What happens to my master password?',
    body: 'The Desktop master password is unrecoverable by design. We never have it. If you forget it, your encrypted keys cannot be decrypted. Back it up.',
  },
  {
    title: 'Is there an Enterprise plan?',
    body: 'Enterprise is contract-scoped rather than self-serve. There is no checkout for it, so it starts with a conversation. On what actually exists rather than what is planned: single sign-on and SCIM directory provisioning are built and are provisioned by us for an organisation. A customer-facing audit-log export and per-organisation retention windows are NOT built, and we would rather say that here than let Enterprise imply the whole category. Contact sales to discuss requirements and timing.',
  },
  {
    title: 'Where do you host data?',
    body: 'Hosted data lives in the United States. We do not offer data residency in the EU, the UK or India, and we are not publishing a date for one: if residency is a requirement for you, we do not meet it today. Local conversations never leave your device in the first place, and BYOK requests go from your client straight to your provider.',
  },
];

export default function FaqPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-faq-title"
          eyebrow="FAQ"
          title="Direct answers, no spin."
          lede="The questions we get most often, answered the way we'd want them answered. If something below is wrong or out of date, email contact@agiworkforce.com and we'll fix it."
          ctas={[]}
        />

        <Section id="qa" labelledBy="agi-faq-qa-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-faq-qa-title">
                {QA.length} questions, {QA.length} straight answers.
              </h2>
              <Prose>
                Providers, trust modes, managed cloud, billing, and what happens to your data. The
                short version of everything the rest of the site covers at length. For the data
                questions in more depth there is a page of its own at{' '}
                <Link href="/data-use" className="agi-ds-link">
                  how we use your data
                </Link>
                , and the policy that governs them all is the{' '}
                <Link href="/privacy" className="agi-ds-link">
                  privacy policy
                </Link>
                .
              </Prose>
            </div>
            <NoteList items={QA} />
          </Stack>
        </Section>

        <Section id="more" labelledBy="agi-faq-more-title" rule ground="2">
          <Stack>
            <h2 className="agi-ds-h2" id="agi-faq-more-title">
              Still stuck? Ask a human.
            </h2>
            <Prose>
              The help index covers the common how-tos, and a real person reads the inbox.
            </Prose>
            <ButtonRow>
              <Button href="/help">Browse the help index</Button>
              <Button href="/pricing" variant="secondary">
                See pricing
              </Button>
              <Button href="/refund-policy" variant="secondary">
                Refund policy
              </Button>
              <Button href="/legal" variant="secondary">
                Legal index
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
