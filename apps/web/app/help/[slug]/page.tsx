import { notFound } from 'next/navigation';
import { Header } from '@shared/components/layout/Header';
import { HelpArticleBody } from '@/features/support/components/HelpArticleBody';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { Section } from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { buildMetadata } from '@/lib/seo/metadata';
import { getHelpArticle, helpArticlePath } from '@/lib/support/help-articles';

type ArticleProps = { params: Promise<{ slug: string }> };

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
            <HelpArticleBody sections={article.sections} />
          </article>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
