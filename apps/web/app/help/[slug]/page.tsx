import { notFound } from 'next/navigation';
import { documentationIndex } from '@/app/docs/doc-index';
import { ArticleFeedback } from '@/features/docs/components/ArticleFeedback';
import { ArticleSupportCards } from '@/features/docs/components/ArticleSupportCards';
import { CopyPageButton } from '@/features/docs/components/CopyPageButton';
import { DocsArticleBody } from '@/features/docs/components/DocsArticleBody';
import { DocsShell } from '@/features/docs/components/DocsShell';
import { PageLink } from '@shared/components/layout/EmbeddedPage';
import {
  DOCS_HOME_PATH,
  docsGroupFor,
  docsNavGroups,
  docsNeighbours,
  docsRelated,
  type DocsNavGroup,
} from '@/features/docs/lib/docs-nav';
import { Breadcrumb } from '@/features/marketing/components/system';
import { buildMetadata } from '@/lib/seo/metadata';
import {
  DOC_AUDIENCE_LABELS,
  describePlans,
  describePlatforms,
  describeReleaseState,
  docMetadataFor,
} from '@/lib/support/doc-metadata';
import { headingAnchor } from '@/lib/support/doc-topics';
import { getHelpArticle, helpArticlePath, purchaseHelpPaths } from '@/lib/support/help-articles';
import {
  HELP_UNAVAILABLE_ON_PHONE_BODY,
  HELP_UNAVAILABLE_ON_PHONE_TITLE,
  HelpArticleUnavailableOnPhone,
} from '../HelpUnavailableOnPhone';
import { openedFromPhone, type HelpSearchParams } from '../phone-request';

type ArticleProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<HelpSearchParams>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return documentationIndex().groups.flatMap((group) =>
    group.entries.map((entry) => ({ slug: entry.docId })),
  );
}

function withoutPaths(
  groups: readonly DocsNavGroup[],
  hidden: ReadonlySet<string>,
): readonly DocsNavGroup[] {
  return groups.map((group) => ({
    ...group,
    links: group.links.filter((link) => !hidden.has(link.href)),
  }));
}

export async function generateMetadata({ params, searchParams }: ArticleProps) {
  const { slug } = await params;
  const fromPhone = await openedFromPhone(searchParams);
  const article = getHelpArticle(slug, fromPhone ? 'phone' : 'web');
  if (!article) {
    if (fromPhone && getHelpArticle(slug)) {
      return buildMetadata({
        title: `${HELP_UNAVAILABLE_ON_PHONE_TITLE} | Help`,
        description: HELP_UNAVAILABLE_ON_PHONE_BODY,
        path: helpArticlePath(slug),
        robots: { index: false },
      });
    }
    notFound();
  }
  return buildMetadata({
    title: `${article.title} | Help`,
    description: article.description ?? `Read the AGI help guide: ${article.title}.`,
    path: helpArticlePath(article.id),
    ogType: 'article',
    updated: article.updated,
  });
}

function articleMarkdown(
  title: string,
  sections: readonly { heading?: string | null; text: string }[],
): string {
  const body = sections
    .map((section) => (section.heading ? `## ${section.heading}\n\n${section.text}` : section.text))
    .join('\n\n');
  return `# ${title}\n\n${body}\n`;
}

export default async function HelpArticlePage({ params, searchParams }: ArticleProps) {
  const { slug } = await params;
  const fromPhone = await openedFromPhone(searchParams);
  const article = getHelpArticle(slug, fromPhone ? 'phone' : 'web');
  if (!article) {
    if (fromPhone && getHelpArticle(slug)) {
      return (
        <DocsShell>
          <HelpArticleUnavailableOnPhone />
        </DocsShell>
      );
    }
    notFound();
  }

  const path = helpArticlePath(article.id);
  const groups = fromPhone
    ? withoutPaths(docsNavGroups(), new Set(purchaseHelpPaths()))
    : docsNavGroups();
  const group = docsGroupFor(groups, path);
  const { previous, next } = docsNeighbours(groups, path);
  const related = docsRelated(groups, path);
  const metadata = docMetadataFor(article.id);
  const toc = article.sections
    .filter((section) => section.heading)
    .map((section) => ({
      id: headingAnchor(section.heading ?? ''),
      title: section.heading ?? '',
    }));

  return (
    <DocsShell toc={toc}>
      <article className="break-words">
        <Breadcrumb
          items={[
            { label: 'Documentation', href: DOCS_HOME_PATH },
            ...(group ? [{ label: group.label }] : []),
            { label: article.title },
          ]}
        />
        <div className="dx-head">
          <h1 className="dx-title" id="help-article-title">
            {article.title}
          </h1>
          <div className="dx-actions">
            <CopyPageButton markdown={articleMarkdown(article.title, article.sections)} />
          </div>
        </div>
        {article.description ? <p className="dx-desc">{article.description}</p> : null}
        <ul className="dx-meta">
          <li>{`Updated ${article.updated}`}</li>
          {metadata ? (
            <>
              <li>{describeReleaseState(metadata)}</li>
              <li>{DOC_AUDIENCE_LABELS[metadata.audience]}</li>
              <li>{describePlatforms(metadata.applicability.platforms)}</li>
              {fromPhone ? null : <li>{describePlans(metadata.applicability.plans)}</li>}
            </>
          ) : null}
        </ul>
        <hr className="dx-rule" />
        <DocsArticleBody sections={article.sections} />
        <ArticleFeedback articleId={article.id} articleTitle={article.title} path={path} />
        <ArticleSupportCards related={related} />
        <nav className="dx-pager" aria-label="More guides">
          {previous ? (
            <PageLink
              href={previous.href}
              className="dx-pager-link"
              data-dir="previous"
              omitWhenEmbedded
            >
              <span className="dx-pager-kicker">Previous</span>
              <span className="dx-pager-title">{previous.title}</span>
            </PageLink>
          ) : null}
          {next ? (
            <PageLink href={next.href} className="dx-pager-link" data-dir="next" omitWhenEmbedded>
              <span className="dx-pager-kicker">Next</span>
              <span className="dx-pager-title">{next.title}</span>
            </PageLink>
          ) : null}
        </nav>
      </article>
    </DocsShell>
  );
}
