import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prose, Stack } from '@/features/marketing/components/system';
import { headingAnchor } from '@/lib/support/doc-topics';

type HelpArticleSection = { id: string; heading?: string | null; text: string };

const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => <Prose>{children}</Prose>,
  a: ({ href, children }) => (
    <a href={href} className="agi-ds-link">
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="agi-ds-prose list-disc space-y-2 ps-6">{children}</ul>,
  ol: ({ children }) => <ol className="agi-ds-prose list-decimal space-y-2 ps-6">{children}</ol>,
  pre: ({ children }) => <pre className="overflow-x-auto rounded-md bg-muted p-4">{children}</pre>,
  table: ({ children }) => (
    <div role="region" aria-label="Scrollable table" tabIndex={0} className="overflow-x-auto">
      <table className="agi-ds-prose w-full border-collapse text-start">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[var(--agi-ground-2)]">{children}</thead>,
  th: ({ children }) => (
    <th
      scope="col"
      className="border-b border-[var(--agi-rule)] px-3 py-2 text-start font-semibold text-[var(--agi-ink)]"
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-[var(--agi-rule)] px-3 py-2 text-[var(--agi-ink-2)]">
      {children}
    </td>
  ),
};

export function HelpArticleBody({ sections }: { sections: readonly HelpArticleSection[] }) {
  return (
    <Stack gap="loose">
      {sections.map((section) => (
        <div key={section.id} className="space-y-4">
          {section.heading ? (
            <h2 className="agi-ds-h2 scroll-mt-24" id={headingAnchor(section.heading)}>
              {section.heading}
            </h2>
          ) : null}
          <ReactMarkdown
            skipHtml
            disallowedElements={['img']}
            remarkPlugins={[remarkGfm]}
            components={MARKDOWN_COMPONENTS}
          >
            {section.text}
          </ReactMarkdown>
        </div>
      ))}
    </Stack>
  );
}
