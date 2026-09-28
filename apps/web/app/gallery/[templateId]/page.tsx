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
import { buildMetadata } from '@/lib/seo/metadata';
import { INSPIRATION, findInspiration, inspirationPath } from '../inspiration';
import { TemplatePreview } from './TemplatePreview';

type PageProps = { params: Promise<{ templateId: string }> };

export function generateStaticParams() {
  return INSPIRATION.map((template) => ({ templateId: template.id }));
}

export async function generateMetadata({ params }: PageProps) {
  const template = findInspiration((await params).templateId);
  if (!template) return {};
  return buildMetadata({
    title: `${template.title}: gallery example`,
    description: template.description,
    path: inspirationPath(template.id),
  });
}

export default async function GalleryTemplatePage({ params }: PageProps) {
  const template = findInspiration((await params).templateId);
  if (!template) notFound();

  const buildHref = `/chat?starterPrompt=${encodeURIComponent(
    `Build something like the "${template.title}" example from the gallery: ${template.description}`,
  )}`;

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <Section id="template" labelledBy="agi-template-title">
          <Stack gap="loose">
            <div>
              <Eyebrow>Gallery example</Eyebrow>
              <h1 className="agi-ds-h1" id="agi-template-title">
                {template.title}
              </h1>
              <Prose>{template.description}</Prose>
            </div>
            <ButtonRow>
              <Button href={buildHref}>Build one like it</Button>
              <Button href="/gallery" variant="secondary">
                Back to the gallery
              </Button>
            </ButtonRow>
            <TemplatePreview template={template} />
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
