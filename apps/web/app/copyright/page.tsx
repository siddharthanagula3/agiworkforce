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
  type LedgerRow,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import {
  CONTACT_SUBJECTS,
  LEGAL_ENTITY,
  NOTICE_ADDRESS,
  POLICY_LAST_UPDATED,
  contactMailto,
} from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Copyright and IP complaints',
  description:
    'How to report content that infringes your copyright or trademark, what a complete notice must contain, how to counter-notify, and what happens to repeat infringers.',
  path: '/copyright',
});

const NOTICE_REQUIREMENTS: readonly LedgerRow[] = [
  {
    label: 'Identify yourself',
    value:
      'Your full name, mailing address, telephone number, and email address. If you are acting for a rights holder, say who they are and what authorizes you to act.',
  },
  {
    label: 'Identify the work',
    value:
      'Describe the copyrighted work or trademark you say is infringed. A registration number helps but is not required.',
  },
  {
    label: 'Identify the material',
    value:
      'Give the exact URL of the shared conversation, published artifact, or file. A description alone is usually not enough to locate it: the same words appear in many conversations.',
  },
  {
    label: 'Two statements',
    value:
      'State that you have a good-faith belief the use is not authorized by the rights holder, its agent, or the law; and that the information in your notice is accurate. Include a statement, under penalty of perjury, that you are authorized to act for the rights holder.',
  },
  {
    label: 'Sign it',
    value:
      'A physical or electronic signature. Typing your full name at the end of the email counts.',
  },
];

const WHAT_HAPPENS: readonly LedgerRow[] = [
  {
    label: 'We disable the link',
    value:
      "A shared conversation link and a published artifact are both revocable server-side. Disabling one stops it resolving for everyone immediately; it does not delete the author's own copy of the underlying conversation.",
  },
  {
    label: 'We tell the user',
    value:
      'The account that published the material is notified, with a copy of the notice, so they can counter-notify. We do not disclose your contact details beyond what the notice itself contains.',
  },
  {
    label: 'They can counter-notify',
    value:
      'If the user believes the removal was a mistake or a misidentification, they may send a counter-notice with their contact details, a statement under penalty of perjury to that effect, and consent to jurisdiction. We may restore the material unless you tell us you have filed an action.',
  },
  {
    label: 'Repeat infringers lose access',
    value:
      'Accounts that accumulate substantiated notices are suspended and then terminated, on the same enforcement ladder as any other acceptable-use violation.',
  },
];

export default function CopyrightPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-copyright-title"
          eyebrow="Legal"
          title="Copyright and IP complaints."
          lede={
            <>
              You can publish a conversation or an artifact at a shareable URL, and you can upload
              files for the agent to read.{' '}
              <strong>
                That means this product can host material someone else owns, so it needs a real
                notice-and-takedown route.
              </strong>{' '}
              This page is that route. It sits alongside the{' '}
              <Link href="/terms" className="agi-ds-link">
                terms of service
              </Link>{' '}
              and the{' '}
              <Link href="/acceptable-use" className="agi-ds-link">
                acceptable use policy
              </Link>
              . Last updated: {POLICY_LAST_UPDATED.copyright}.
            </>
          }
          ctas={[{ href: '/copyright/report', label: 'Send a notice' }]}
        />

        <Section id="how-to-send" labelledBy="agi-copyright-send-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-copyright-send-title">
                How to send a notice.
              </h2>
              <Prose>
                Use the{' '}
                <Link href="/copyright/report" className="agi-ds-link">
                  notice form
                </Link>
                . It checks that the URL you report still resolves to something published here,
                gives you a reference, and puts the notice in front of the person who can disable
                the link. Every public share and published artifact page links straight to it.
              </Prose>
              <Prose>
                If you would rather email, write to{' '}
                <a href={contactMailto(CONTACT_SUBJECTS.ipComplaint)} className="agi-ds-link">
                  our contact mailbox
                </a>{' '}
                with the subject line &ldquo;{CONTACT_SUBJECTS.ipComplaint}&rdquo;. Subject-line
                routing is how every policy mailbox on this site works; a notice sent without it
                still arrives, but is slower to reach the right person.
              </Prose>
            </div>
            <Ledger caption="What a complete notice needs" rows={NOTICE_REQUIREMENTS} />
            <Prose size="sm">
              An incomplete notice is not ignored, but it may be slower to action: without a URL we
              often cannot identify the material at all.
            </Prose>
          </Stack>
        </Section>

        <Section id="what-happens" labelledBy="agi-copyright-happens-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-copyright-happens-title">
              What happens next.
            </h2>
            <Ledger caption="What happens next" rows={WHAT_HAPPENS} />
          </Stack>
        </Section>

        <Section id="model-output" labelledBy="agi-copyright-model-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-copyright-model-title">
              Model output.
            </h2>
            <Prose>
              Generated text, images, and audio can resemble existing work. If you believe a
              generation reproduces something you own, send a notice the same way and include the
              prompt or the shared link: we need to be able to reproduce what you saw. Where the
              output came from a third-party model provider, their terms also apply; those providers
              are listed on{' '}
              <Link href="/subprocessors" className="agi-ds-link">
                /subprocessors
              </Link>
              , and the licence terms attached to each model are on{' '}
              <Link href="/model-licenses" className="agi-ds-link">
                /model-licenses
              </Link>
              .
            </Prose>
          </Stack>
        </Section>

        <Section id="misuse" labelledBy="agi-copyright-misuse-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-copyright-misuse-title">
              Misuse of this process.
            </h2>
            <Prose>
              Knowingly filing a false notice, or a false counter-notice, carries liability for
              damages and costs. We keep a record of notices and counter-notices.
            </Prose>
            <Prose>
              {LEGAL_ENTITY}, {NOTICE_ADDRESS}. Material changes to this policy are recorded on{' '}
              <Link href="/changelog" className="agi-ds-link">
                /changelog
              </Link>
              .
            </Prose>
            <ButtonRow>
              <Button href="/terms" variant="secondary">
                Terms
              </Button>
              <Button href="/acceptable-use" variant="secondary">
                Acceptable use
              </Button>
              <Button href="/model-licenses" variant="secondary">
                Model licences
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
