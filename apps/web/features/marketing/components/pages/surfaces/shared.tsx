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
}: {
  id: string;
  eyebrow: string;
  title: string;
  em?: string;
  lede: ReactNode;
  ctas: readonly PageCta[];
  visual?: ReactNode;
}) {
  const copy = (
    <Stack gap="loose">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="agi-ds-h1" id={id}>
          {em && title.includes(em) ? (
            <>
              {title.slice(0, title.indexOf(em))}
              <em className="agi-ds-accent">{em}</em>
              {title.slice(title.indexOf(em) + em.length)}
            </>
          ) : (
            title
          )}
        </h1>
      </div>
      <Prose size="lg">{lede}</Prose>
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

  if (!visual) {
    return (
      <section className="agi-ds-section agi-ds-hero" aria-labelledby={id}>
        <div className="agi-ds-container">
          <div style={{ width: 'fit-content', maxWidth: '100%', marginInline: 'auto' }}>{copy}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="agi-ds-section agi-ds-hero" aria-labelledby={id}>
      <div className="agi-ds-container">
        <div className="agi-ds-grid-2">
          {copy}
          {visual}
        </div>
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
