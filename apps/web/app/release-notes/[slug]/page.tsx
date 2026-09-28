import { notFound } from 'next/navigation';

import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { releasePath, releaseSlug } from '@/lib/changelog-entries';
import { buildMetadata } from '@/lib/seo/metadata';
import { RELEASE_NOTES, releaseStateLine } from '../release-notes-data';

type PageProps = { params: Promise<{ slug: string }> };

function findRelease(slug: string) {
  return RELEASE_NOTES.find((note) => releaseSlug(note) === slug) ?? null;
}

export function generateStaticParams() {
  return RELEASE_NOTES.map((note) => ({ slug: releaseSlug(note) }));
}

export async function generateMetadata({ params }: PageProps) {
  const note = findRelease((await params).slug);
  if (!note) return {};
  return buildMetadata({
    title: note.headline,
    description: note.body[0] ?? note.headline,
    path: releasePath(note),
  });
}

export default async function ReleaseAnnouncementPage({ params }: PageProps) {
  const note = findRelease((await params).slug);
  if (!note) notFound();

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <Section id="release" labelledBy="agi-release-title">
          <Stack gap="loose">
            <div>
              <Eyebrow>
                {note.date} · {releaseStateLine(note)}
              </Eyebrow>
              <h1 className="agi-ds-h1" id="agi-release-title">
                {note.headline}
              </h1>
            </div>
            {note.body.map((line) => (
              <Prose key={line}>{line}</Prose>
            ))}
            <ButtonRow>
              <Button href="/release-notes" variant="secondary">
                All release notes
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
