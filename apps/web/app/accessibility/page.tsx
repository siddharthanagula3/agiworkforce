import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Button, ButtonRow, Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { NoteList } from '@/features/marketing/components/pages/company/shared';
import { Ledger, type LedgerRow } from '@/features/marketing/components/system';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import { ScanScope } from './ScanScope';

export const metadata = buildMetadata({
  title: 'Accessibility',
  description:
    'How AGI supports accessibility · keyboard, screen-reader, prefers-reduced-motion, contrast.',
  path: '/accessibility',
});

const DONE: readonly LedgerRow[] = [
  {
    label: 'Keyboard',
    value:
      'A skip-link is mounted on every page, and keyboard reachability is a requirement we hold new interactive components to. We have not completed a keyboard-operability audit across all six surfaces and hold no VPAT, so we do not claim every element passes. If you find one that does not, it is a bug and we will treat it as one.',
  },
  {
    label: 'Screen reader',
    value:
      "Semantic HTML: landmarks, headings in order, lists, labeled controls. ARIA labels where semantics aren't enough. Verified by automated scan on the routes listed below, not by testing with an actual screen reader on every page.",
  },
  {
    label: 'Reduced motion',
    value: (
      <>
        <code>prefers-reduced-motion: reduce</code> short-circuits decorative animations site-wide.
      </>
    ),
  },
  {
    label: 'Contrast',
    value:
      'Body text and primary UI surfaces meet AA contrast against the page ground, in both light and dark schemes, on the routes listed below. Tertiary copy meets large-text AA.',
  },
  {
    label: 'Focus',
    value: (
      <>
        Visible focus rings are the house rule and <code>outline: none</code> is not used without an
        explicit replacement. As with keyboard operability above, that is a standard we hold
        components to rather than a per-element audit result: we do not claim every element on every
        route has been checked.
      </>
    ),
  },
];

const GAPS = [
  {
    title: 'Live transcripts',
    body: 'Voice features in the desktop app do not yet ship live transcripts. Tracking it as a P1.',
  },
  {
    title: 'Colour-only signals',
    body: "A handful of status badges still rely on colour alone. We're adding text labels where this is the case.",
  },
  {
    title: 'Long forms',
    body: "A few legacy forms have inconsistent error-summary placement. We're standardising on a top-of-form summary.",
  },
];

export default function AccessibilityPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-accessibility-title"
          eyebrow="Legal"
          title="Accessibility."
          lede={
            <>
              We aim for WCAG 2.1 AA across the web app and the marketing site. Below is what
              we&rsquo;ve done, what is in flight, and the known gaps. If you hit a barrier, email
              contact@agiworkforce.com, and we treat it as a P0. Last updated:{' '}
              {POLICY_LAST_UPDATED.accessibility}.
            </>
          }
          ctas={[]}
        />

        <Section id="done" labelledBy="agi-accessibility-done-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-accessibility-done-title">
              What we&rsquo;ve done.
            </h2>
            <Ledger caption="Accessibility posture" rows={DONE} />
            <ScanScope />
          </Stack>
        </Section>

        <Section id="gaps" labelledBy="agi-accessibility-gaps-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-accessibility-gaps-title">
              Known gaps.
            </h2>
            <NoteList items={GAPS} />
          </Stack>
        </Section>

        <Section id="report" labelledBy="agi-accessibility-report-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-accessibility-report-title">
              Report a barrier.
            </h2>
            <Prose>Email contact@agiworkforce.com and we treat it as a P0.</Prose>
            <ButtonRow>
              <Button href="mailto:contact@agiworkforce.com">Email contact@agiworkforce.com</Button>
              <Button href="/security" variant="secondary">
                Security posture
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
