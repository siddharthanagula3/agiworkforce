'use client';

/**
 * InteractiveCardBlock — the web transcript's renderer for interactive cards.
 *
 * Slice 1 ships the DEGRADATION path only, deliberately and before any producer
 * exists. Every card currently renders its server-authored `fallback.text`
 * inside card chrome; kind-specific renderers register later and this file does
 * not change shape when they do.
 *
 * Shipping this first is the point. A degradation path retrofitted under
 * deadline pressure is a degradation path that does not work, and this one has
 * to carry four separate cases: a kind this build has never heard of, a
 * schemaVersion from a newer server, a body that failed validation, and a kind
 * this surface deliberately does not render. All four land here, so the path is
 * exercised constantly rather than only in the emergency it exists for.
 */

import { memo } from 'react';
import {
  resolveInteractiveCardRenderer,
  type InteractiveCard,
  type InteractiveCardRegistry,
} from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';
import { ClarifyCard, type ClarifyCardContext } from './cards/ClarifyCard';

/**
 * Kind-specific renderers.
 *
 * `clarify.v1` registered in slice 2 (2026-08-06). `itinerary.v1` still has no
 * renderer and no producer, so it keeps falling back — an entry here with no
 * producer would be untested code pretending to be shipped.
 */
const WEB_CARD_REGISTRY: InteractiveCardRegistry<React.ReactNode> = {
  'clarify.v1': ({ card, body, ctx }) => (
    <ClarifyCard card={card} body={body} ctx={ctx as ClarifyCardContext} />
  ),
};

interface InteractiveCardBlockProps {
  cards: readonly InteractiveCard[];
  className?: string;
}

interface SingleCardProps {
  card: InteractiveCard;
}

const SingleCard = memo(function SingleCard({ card }: SingleCardProps) {
  const renderer = resolveInteractiveCardRenderer(WEB_CARD_REGISTRY, card);

  if (renderer && card.recognized) {
    // The cast is confined to this one line: `resolveInteractiveCardRenderer`
    // has already proven the kind matches an entry in the registry, but TS
    // cannot carry that correlation across the lookup.
    return (
      <>
        {(
          renderer as (props: {
            card: InteractiveCard;
            body: unknown;
            ctx: unknown;
          }) => React.ReactNode
        )({
          card,
          body: card.body,
          ctx: { canRespond: false },
        })}
      </>
    );
  }

  /*
   * Fallback. `fallback.text` is PLAIN TEXT by contract — not markdown — so it
   * renders through `whitespace-pre-wrap` rather than the markdown pipeline.
   * Running it through markdown would turn an itinerary's literal asterisks
   * into bullets on some surfaces and leave them visible on others.
   */
  return (
    <section
      aria-label={card.fallback.headline}
      data-testid="interactive-card-fallback"
      data-card-kind={card.kind}
      data-card-recognized={String(card.recognized)}
      className={cn(
        'my-2 rounded-xl border px-4 py-3',
        'border-[var(--chat-border-strong)] bg-[var(--chat-surface-hover)]',
      )}
    >
      <p className="text-sm font-semibold text-foreground">{card.fallback.headline}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{card.fallback.text}</p>
    </section>
  );
});
SingleCard.displayName = 'SingleCard';

export const InteractiveCardBlock = memo(function InteractiveCardBlock({
  cards,
  className,
}: InteractiveCardBlockProps) {
  if (cards.length === 0) return null;
  return (
    <div className={className}>
      {cards.map((card) => (
        <SingleCard key={card.cardId} card={card} />
      ))}
    </div>
  );
});
InteractiveCardBlock.displayName = 'InteractiveCardBlock';
