import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CopyPageButton } from '@/features/docs/components/CopyPageButton';
import { DocsArticleBody } from '@/features/docs/components/DocsArticleBody';
import { DocsShell } from '@/features/docs/components/DocsShell';
import { DOCS_HOME_PATH, docsNavGroups, docsNeighbours } from '@/features/docs/lib/docs-nav';
import { buildMetadata } from '@/lib/seo/metadata';
import {
  DOC_AUDIENCE_LABELS,
  DOC_MATURITY_LABELS,
  describePlans,
  describePlatforms,
  docMetadataFor,
} from '@/lib/support/doc-metadata';
import { headingAnchor } from '@/lib/support/doc-topics';
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

function articleMarkdown(
  title: string,
  sections: readonly { heading?: string | null; text: string }[],
): string {
  const body = sections
    .map((section) => (section.heading ? `## ${section.heading}\n\n${section.text}` : section.text))
    .join('\n\n');
  return `# ${title}\n\n${body}\n`;
}

export default async function HelpArticlePage({ params }: ArticleProps) {
  const { slug } = await params;
  const article = getHelpArticle(slug);
  if (!article) notFound();

  const path = helpArticlePath(article.id);
  const groups = docsNavGroups();
  const group = groups.find((candidate) => candidate.links.some((link) => link.href === path));
  const { previous, next } = docsNeighbours(groups, path);
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
        <ol className="dx-crumb" aria-label="Breadcrumb">
          <li>
            <Link href={DOCS_HOME_PATH}>Documentation</Link>
          </li>
          {group ? <li>{group.label}</li> : null}
        </ol>
        <div className="dx-head">
          <h1 className="dx-title" id="help-article-title">
            {article.title}
          </h1>
          <div className="dx-actions">
            <CopyPageButton markdown={articleMarkdown(article.title, article.sections)} />
          </div>
        </div>
        <ul className="dx-meta">
          <li>{`Updated ${article.updated}`}</li>
          {metadata ? (
            <>
              <li>{DOC_MATURITY_LABELS[metadata.maturity]}</li>
              <li>{DOC_AUDIENCE_LABELS[metadata.audience]}</li>
              <li>{describePlatforms(metadata.applicability.platforms)}</li>
              <li>{describePlans(metadata.applicability.plans)}</li>
            </>
          ) : null}
        </ul>
        <hr className="dx-rule" />
        <DocsArticleBody sections={article.sections} />
        <nav className="dx-pager" aria-label="More guides">
          {previous ? (
            <Link href={previous.href} className="dx-pager-link" data-dir="previous">
              <span className="dx-pager-kicker">Previous</span>
              <span className="dx-pager-title">{previous.title}</span>
            </Link>
          ) : null}
          {next ? (
            <Link href={next.href} className="dx-pager-link" data-dir="next">
              <span className="dx-pager-kicker">Next</span>
              <span className="dx-pager-title">{next.title}</span>
            </Link>
          ) : null}
        </nav>
      </article>
    </DocsShell>
  );
}
