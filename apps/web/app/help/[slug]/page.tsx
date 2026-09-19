import { notFound } from 'next/navigation';
import ReactMarkdown, { type Components } from 'react-markdown';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Prose, Section, Stack } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { buildMetadata } from '@/lib/seo/metadata';
import { getHelpArticle, helpArticlePath } from '@/lib/support/help-articles';

type ArticleProps = { params: Promise<{ slug: string }> };

const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => <Prose>{children}</Prose>,
  a: ({ href, children }) => (
    <a href={href} className="agi-ds-link">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="list-disc space-y-2 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-2 pl-6">{children}</ol>,
  pre: ({ children }) => <pre className="overflow-x-auto rounded-md bg-muted p-4">{children}</pre>,
};

export async function generateMetadata({ params }: ArticleProps) {
  const { slug } = await params;
  const article = getHelpArticle(slug);
  if (!article) notFound();
  return buildMetadata({
    title: `${article.title} | Help`,
    description: `Read the AGI help guide: ${article.title}.`,
    path: helpArticlePath(article.id),
    ogType: 'article',
  });
}

export default async function HelpArticlePage({ params }: ArticleProps) {
  const { slug } = await params;
  const article = getHelpArticle(slug);
  if (!article) notFound();
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content" className="break-words">
        <PageHero
          id="help-article-title"
          eyebrow="Help guide"
          title={article.title}
          lede={`Last updated ${article.updated}.`}
          ctas={[
            { label: 'All help articles', href: '/help' },
            { label: 'Open related page', href: article.relatedPath, variant: 'secondary' },
          ]}
        />
        <Section labelledBy="help-article-title" rule>
          <article className="max-w-prose">
            <Stack gap="loose">
              {article.sections.map((section) => (
                <div key={section.id} className="space-y-4">
                  {section.heading ? <h2 className="agi-ds-h2">{section.heading}</h2> : null}
                  <ReactMarkdown
                    skipHtml
                    disallowedElements={['img']}
                    components={MARKDOWN_COMPONENTS}
                  >
                    {section.text}
                  </ReactMarkdown>
                </div>
              ))}
            </Stack>
          </article>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
