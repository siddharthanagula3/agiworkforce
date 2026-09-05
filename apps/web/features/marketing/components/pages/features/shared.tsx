import Link from 'next/link';
import type { ReactNode } from 'react';
import { Eyebrow, Prose } from '../../system';

export interface LinkCardItem {
  meta: string;
  title: string;
  body: ReactNode;
  href: string;
  external?: boolean;
}

export function LinkGrid({ items }: { items: readonly LinkCardItem[] }) {
  const spanLastItem = items.length % 2 === 1;
  const lastIndex = items.length - 1;

  return (
    <div className="agi-ds-grid-2">
      {items.map((item, index) => {
        const card = (
          <>
            <Eyebrow>{item.meta}</Eyebrow>
            <h3 className="agi-ds-h3">
              {item.external ? (
                <a
                  href={item.href}
                  className="agi-ds-link"
                  style={{ backgroundSize: '100% 1px' }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.title}
                </a>
              ) : (
                <Link
                  href={item.href}
                  className="agi-ds-link"
                  style={{ backgroundSize: '100% 1px' }}
                >
                  {item.title}
                </Link>
              )}
            </h3>
            <Prose size="sm">{item.body}</Prose>
          </>
        );

        if (spanLastItem && index === lastIndex) {
          return (
            <div className="agi-ds-card" style={{ gridColumn: '1 / -1' }} key={item.title}>
              {card}
            </div>
          );
        }

        return (
          <div className="agi-ds-card" key={item.title}>
            {card}
          </div>
        );
      })}
    </div>
  );
}
