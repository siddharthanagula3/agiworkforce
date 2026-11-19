import { PageLink } from '@shared/components/layout/EmbeddedPage';
import { ChevronRight } from 'lucide-react';
import type { DocsNavLink } from '../lib/docs-nav';

const SUPPORT_CARDS = [
  { href: '/support', title: 'Support', body: 'See how to reach us and what to expect.' },
  { href: '/contact', title: 'Contact us', body: 'Send a question or report a problem.' },
] as const;

export function ArticleSupportCards({ related }: { related: readonly DocsNavLink[] }) {
  return (
    <>
      <section className="dx-support" aria-labelledby="help-article-support">
        <h2 className="dx-h2" id="help-article-support">
          Need more help?
        </h2>
        <div className="dx-cards" data-cols="2">
          {SUPPORT_CARDS.map((card) => (
            <PageLink key={card.href} href={card.href} className="dx-card" omitWhenEmbedded>
              <span className="dx-card-title">{card.title}</span>
              <span className="dx-card-body">{card.body}</span>
            </PageLink>
          ))}
        </div>
      </section>
      {related.length > 0 ? (
        <section className="dx-support" aria-labelledby="help-article-related">
          <h2 className="dx-h2" id="help-article-related">
            Related articles
          </h2>
          <ul className="dx-related">
            {related.map((link) => (
              <li key={link.href}>
                <PageLink href={link.href} className="dx-related-link" omitWhenEmbedded>
                  <span className="dx-card-title">{link.title}</span>
                  <ChevronRight aria-hidden="true" />
                </PageLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
