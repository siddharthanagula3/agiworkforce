import type { ReactNode } from 'react';
import { Button, ButtonRow, Eyebrow, Prose, Stack } from '../../system';

export interface PageCta {
  href: string;
  label: string;
  variant?: 'primary' | 'secondary';
}

export function PageHero({
  id,
  eyebrow,
  title,
  em,
  lede,
  ctas,
  visual,
  minimal = false,
}: {
  id: string;
  eyebrow: string;
  title: string;
  em?: string;
  lede: ReactNode;
  ctas: readonly PageCta[];
  visual?: ReactNode;
  minimal?: boolean;
}) {
  const copy = (
    <Stack className="agi-ds-pagehead-copy">
      <div>
        <span className="agi-ds-pagehead-label">{eyebrow}</span>
        <h1 className={minimal ? 'sr-only' : 'agi-ds-pagehead-title'} id={id}>
          {em && title.includes(em) ? (
            <>
              {title.slice(0, title.indexOf(em))}
              <span className="agi-ds-pagehead-em">{em}</span>
              {title.slice(title.indexOf(em) + em.length)}
            </>
          ) : (
            title
          )}
        </h1>
      </div>
      {!minimal ? <Prose className="agi-ds-pagehead-lede">{lede}</Prose> : null}
      {ctas.length > 0 ? (
        <ButtonRow>
          {ctas.map((cta) => (
            <Button href={cta.href} variant={cta.variant} key={cta.href}>
              {cta.label}
            </Button>
          ))}
        </ButtonRow>
      ) : null}
    </Stack>
  );

  return (
    <section
      className="agi-ds-pagehead"
      aria-labelledby={id}
      data-minimal={minimal ? 'true' : undefined}
    >
      <div className="agi-ds-container">
        {visual ? (
          <div className="agi-ds-pagehead-split">
            {copy}
            {visual}
          </div>
        ) : (
          copy
        )}
      </div>
    </section>
  );
}

export function FactLine({ facts }: { facts: readonly string[] }) {
  return (
    <div className="agi-lp-factline">
      <ul className="agi-ds-container agi-lp-factline-list">
        {facts.map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
    </div>
  );
}

export interface FactItem {
  meta: string;
  title: string;
  body: ReactNode;
}

const EQUAL_THIRDS_ITEM_COUNT = 3;

export function FactGrid({
  items,
  layout = 'grid',
}: {
  items: readonly FactItem[];
  layout?: 'grid' | 'rows';
}) {
  const stacked = layout === 'rows';
  const spanLastItem =
    !stacked && items.length % 2 === 1 && items.length !== EQUAL_THIRDS_ITEM_COUNT;
  const lastIndex = items.length - 1;

  const cards = items.map((item, index) => (
    <div
      className={stacked ? 'agi-ds-card agi-ds-full' : 'agi-ds-card'}
      style={spanLastItem && index === lastIndex ? { gridColumn: '1 / -1' } : undefined}
      key={item.title}
    >
      <Eyebrow>{item.meta}</Eyebrow>
      <h3 className="agi-ds-h3">{item.title}</h3>
      <Prose size="sm">{item.body}</Prose>
    </div>
  ));

  if (stacked) {
    return <Stack className="agi-ds-full">{cards}</Stack>;
  }

  return <div className="agi-ds-grid-2">{cards}</div>;
}
