import type { CSSProperties } from 'react';
import Link from 'next/link';
import { SURFACE_CARDS, SURFACES_HEAD } from './content';
import { PICTOGRAMS } from './Pictograms';
import { Rise } from './Rise';
import { Section } from './Section';

export function Surfaces() {
  return (
    <Section id="surfaces" title={SURFACES_HEAD.title} lead={SURFACES_HEAD.lede}>
      <Rise>
        <ul className="f2-surfaces">
          {SURFACE_CARDS.map((card, index) => (
            <li
              key={card.id}
              className="f2-surface"
              data-live={card.live}
              style={{ '--card': index } as CSSProperties}
            >
              <div className="f2-picto-tile" data-illustration>
                {PICTOGRAMS[card.id]}
              </div>
              <div className="f2-surface-name">{card.name}</div>
              <div className="f2-label">{card.kind}</div>
              <span className="f2-status" data-live={card.live}>
                {card.status}
              </span>
              {card.live ? (
                <Link href={card.action.href} className="f2-btn f2-btn--primary f2-btn--small">
                  {card.action.label}
                </Link>
              ) : (
                <Link href={card.action.href} className="f2-link">
                  {card.action.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </Rise>
    </Section>
  );
}
