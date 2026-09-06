import Link from 'next/link';
import type { ReactNode } from 'react';

export interface BentoTile {
  eyebrow?: string;
  title: string;
  body: string;
  href: string;
  visual?: ReactNode;
  span?: 1 | 2;
  cta?: string;
}

const DEFAULT_CTA = 'Explore';

export function Bento({ tiles, label }: { tiles: readonly BentoTile[]; label: string }) {
  return (
    <div className="agi-ds-bento" role="list" aria-label={label}>
      {tiles.map((tile) => (
        <Link
          href={tile.href}
          className="agi-ds-bento-tile"
          data-span={tile.span ?? 1}
          role="listitem"
          key={tile.title}
        >
          {tile.visual ? (
            <div className="agi-ds-bento-visual" aria-hidden="true">
              {tile.visual}
            </div>
          ) : null}
          <span className="agi-ds-bento-foot">
            <span className="agi-ds-bento-text">
              {tile.eyebrow ? <span className="agi-ds-bento-eyebrow">{tile.eyebrow}</span> : null}
              <span className="agi-ds-bento-title">{tile.title}</span>
              <span className="agi-ds-bento-body">{tile.body}</span>
            </span>
            <span className="agi-ds-bento-cta">{tile.cta ?? DEFAULT_CTA} →</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
