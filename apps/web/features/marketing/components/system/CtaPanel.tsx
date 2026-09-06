import { Button } from './Button';
import { Checklist } from './Checklist';

export interface CtaCard {
  title: string;
  body: string;
  points: readonly string[];
  cta: { href: string; label: string };
}

export function CtaPanel({ cards, label }: { cards: readonly CtaCard[]; label: string }) {
  return (
    <div className="agi-ds-ctapanel" aria-label={label}>
      {cards.map((card, index) => (
        <article className="agi-ds-ctacard" key={card.title}>
          <h3 className="agi-ds-ctacard-title">{card.title}</h3>
          <p className="agi-ds-ctacard-body">{card.body}</p>
          <Checklist items={card.points} />
          <div className="agi-ds-ctacard-cta">
            <Button href={card.cta.href} variant={index === 0 ? 'primary' : 'secondary'}>
              {card.cta.label}
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}
