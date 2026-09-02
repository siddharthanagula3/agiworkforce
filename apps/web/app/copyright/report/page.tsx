import Link from 'next/link';

import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { CONTACT_SUBJECTS, contactMailto } from '@/lib/legal-constants';
import { buildMetadata } from '@/lib/seo/metadata';

import { CopyrightNoticeForm } from './CopyrightNoticeForm';

export const metadata = buildMetadata({
  title: 'Report infringing content',
  description:
    'Send a copyright or trademark notice about a shared conversation or published artifact hosted here, and get a reference for it.',
  path: '/copyright/report',
});

const PUBLIC_PREFIXES = ['/share/', '/shared-artifact/'];

function safeReportedUrl(raw: string | undefined): string {
  if (!raw) return '';
  const value = raw.trim().slice(0, 2048);
  if (PUBLIC_PREFIXES.some((prefix) => value.startsWith(prefix))) return value;
  try {
    const parsed = new URL(value);
    return PUBLIC_PREFIXES.some((prefix) => parsed.pathname.startsWith(prefix)) ? value : '';
  } catch {
    return '';
  }
}

export default async function CopyrightReportPage({
  searchParams,
}: {
  searchParams: Promise<{ url?: string }>;
}) {
  const { url } = await searchParams;

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-copyright-report-title"
          eyebrow="Copyright · notice and takedown"
          title="Report infringing content."
          lede={
            <>
              This form is for material published here at a public URL: a shared conversation under
              /share, or a published artifact under /shared-artifact. It records the notice, gives
              you a reference, and forwards it to the contact who can disable the link. The policy
              behind it, including counter-notices and repeat infringers, is on{' '}
              <Link href="/copyright" className="agi-ds-link">
                /copyright
              </Link>
              . You can also send the same notice by email to{' '}
              <a href={contactMailto(CONTACT_SUBJECTS.ipComplaint)} className="agi-ds-link">
                our contact mailbox
              </a>
              .
            </>
          }
          ctas={[]}
        />

        <Section id="notice" labelledBy="agi-copyright-report-notice-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-copyright-report-notice-title">
              Your notice.
            </h2>
            <CopyrightNoticeForm reportedUrl={safeReportedUrl(url)} />
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
