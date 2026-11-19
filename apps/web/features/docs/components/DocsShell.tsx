import type { ReactNode } from 'react';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import '../docs.css';
import { docsNavGroups, docsSearchLinks } from '../lib/docs-nav';
import { DocsNavigation } from './DocsNavigation';
import { DocsShellFrame } from './DocsShellFrame';
import { DocsToc, type DocsTocItem } from './DocsToc';

export function DocsShell({
  children,
  toc,
}: {
  children: ReactNode;
  toc?: readonly DocsTocItem[];
}) {
  const groups = docsNavGroups();
  const hasToc = toc !== undefined && toc.length > 1;
  return (
    <div data-design="agi" className="dx">
      <Header />
      <DocsShellFrame
        navigation={<DocsNavigation groups={groups} searchLinks={docsSearchLinks()} />}
      >
        <main id="main-content" tabIndex={-1} className="dx-main" data-wide={!hasToc}>
          {hasToc ? <DocsToc items={toc} /> : null}
          <div className="dx-body">{children}</div>
        </main>
      </DocsShellFrame>
      <MarketingFooter />
    </div>
  );
}
