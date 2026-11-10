import type { ReactNode } from 'react';
import { DOCS_HOME_PATH, docsGroupFor, docsNavGroups } from '@/features/docs/lib/docs-nav';
import { articleSchema, breadcrumbSchema } from '@/lib/seo/structured-data';
import { getHelpArticle, helpArticlePath } from '@/lib/support/help-articles';
import { JsonLd } from '@shared/components/seo/JsonLd';

type HelpArticleLayoutProps = {
  children: ReactNode;
  params: Promise<{ slug: string }>;
};

export default async function HelpArticleLayout({ children, params }: HelpArticleLayoutProps) {
  const { slug } = await params;
  const article = getHelpArticle(slug);
  if (!article) return children;

  const path = helpArticlePath(article.id);
  const group = docsGroupFor(docsNavGroups(), path);

  return (
    <>
      <JsonLd
        data={[
          articleSchema({ ...article, path }),
          breadcrumbSchema([
            { name: 'Documentation', path: DOCS_HOME_PATH },
            ...(group ? [{ name: group.label, path: `/help/collections/${group.id}` }] : []),
            { name: article.title, path },
          ]),
        ]}
      />
      {children}
    </>
  );
}
