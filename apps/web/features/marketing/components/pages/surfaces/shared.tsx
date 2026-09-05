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
  lede,
  ctas,
  visual,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lede: ReactNode;
  ctas: readonly PageCta[];
  visual?: ReactNode;
}) {
  const copy = (
    <Stack gap="loose">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="agi-ds-h1" id={id}>
          {title}
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

export function FactGrid({ items }: { items: readonly FactItem[] }) {
  const spanLastItem = items.length % 2 === 1;
  const lastIndex = items.length - 1;

  return (
    <div className="agi-ds-grid-2">
      {items.map((item, index) => {
        const fact = (
          <>
            <Eyebrow>{item.meta}</Eyebrow>
            <h3 className="agi-ds-h3">{item.title}</h3>
            <Prose size="sm">{item.body}</Prose>
          </>
        );

        if (spanLastItem && index === lastIndex) {
          return (
            <div className="agi-ds-card" style={{ gridColumn: '1 / -1' }} key={item.title}>
              {fact}
            </div>
          );
        }

        return (
          <div className="agi-ds-card" key={item.title}>
            {fact}
          </div>
        );
      })}
    </div>
  );
}
