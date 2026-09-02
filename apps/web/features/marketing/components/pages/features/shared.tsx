import Link from 'next/link';
import type { ReactNode } from 'react';
import { Eyebrow, Prose, Stack } from '../../system';

export interface LinkCardItem {
  meta: string;
  title: string;
  body: ReactNode;
  href: string;
  external?: boolean;
}

export function LinkGrid({ items }: { items: readonly LinkCardItem[] }) {
  return (
    <div className="agi-ds-grid-2">
      {items.map((item) => (
        <Stack key={item.title}>
          <Eyebrow>{item.meta}</Eyebrow>
          <h3 className="agi-ds-h3">
            {item.external ? (
              <a href={item.href} className="agi-ds-link" target="_blank" rel="noopener noreferrer">
                {item.title}
              </a>
            ) : (
              <Link href={item.href} className="agi-ds-link">
                {item.title}
              </Link>
            )}
          </h3>
          <Prose size="sm">{item.body}</Prose>
        </Stack>
      ))}
    </div>
  );
}
