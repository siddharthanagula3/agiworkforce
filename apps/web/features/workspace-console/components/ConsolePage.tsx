import type { ReactNode } from 'react';

import { HelpArticleLink } from '@/features/support/components/HelpArticleLink';

export function ConsolePage({
  title,
  description,
  help,
  children,
}: {
  title: string;
  description: string;
  help?: { docId: string; label: string };
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-h2" style={{ color: 'var(--text-1)' }}>
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--text-3)' }}>
          {description}
        </p>
        {help ? (
          <div className="mt-2">
            <HelpArticleLink docId={help.docId} label={help.label} />
          </div>
        ) : null}
      </header>
      {children}
    </div>
  );
}
