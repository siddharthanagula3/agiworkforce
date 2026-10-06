import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { headingAnchor } from '@/lib/support/doc-topics';
import { DocsCodeBlock } from './DocsCodeBlock';

export interface DocsArticleSection {
  id: string;
  heading?: string | null;
  text: string;
}

const MARKDOWN_COMPONENTS: Components = {
  pre: ({ children, node }) => {
    const code = node?.children.find(
      (child) => child.type === 'element' && child.tagName === 'code',
    );
    if (!code || code.type !== 'element' || code.children.some((child) => child.type !== 'text'))
      return <pre>{children}</pre>;
    const classes = code.properties['className'];
    const languageClass = (Array.isArray(classes) ? classes : [classes]).find(
      (value) => typeof value === 'string' && value.startsWith('language-'),
    );
    const language =
      typeof languageClass === 'string' ? languageClass.slice('language-'.length) : undefined;
    const text = code.children.map((child) => (child.type === 'text' ? child.value : '')).join('');
    return <DocsCodeBlock code={text} language={language} />;
  },
  table: ({ children }) => (
    <div className="dx-table" role="region" aria-label="Scrollable table" tabIndex={0}>
      <table>{children}</table>
    </div>
  ),
  th: ({ children }) => <th scope="col">{children}</th>,
};

export function DocsArticleBody({ sections }: { sections: readonly DocsArticleSection[] }) {
  return (
    <div className="dx-prose">
      {sections.map((section) => (
        <section key={section.id}>
          {section.heading ? (
            <h2 id={headingAnchor(section.heading)}>
              <a className="dx-section-link" href={`#${headingAnchor(section.heading)}`}>
                {section.heading}
              </a>
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
        </section>
      ))}
    </div>
  );
}
