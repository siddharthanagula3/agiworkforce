'use client';

import { memo } from 'react';
import { isAllowedMapSearchProviderUrl } from '@agiworkforce/cloud-contracts';
import {
  resolveInteractiveCardRenderer,
  type InteractiveCard,
  type InteractiveCardRegistry,
} from '@agiworkforce/types';
import { cn } from '@shared/lib/utils';
import { ClarifyCard, type ClarifyCardContext } from './cards/ClarifyCard';
import { MapSearchCard } from './cards/MapSearchCard';
import { McpAppCard } from './cards/McpAppCard';

const WEB_CARD_REGISTRY: InteractiveCardRegistry<React.ReactNode> = {
  'clarify.v1': ({ card, body, ctx }) => (
    <ClarifyCard card={card} body={body} ctx={ctx as ClarifyCardContext} />
  ),
  'map-search.v1': ({ body, ctx }) => <MapSearchCard body={body} ctx={ctx} />,
  'mcp-app.v1': ({ body }) => <McpAppCard body={body} />,
};

function openMapSearchProviderUrl(value: string): void {
  if (!isAllowedMapSearchProviderUrl(value)) return;
  window.open(new URL(value).toString(), '_blank', 'noopener,noreferrer');
}

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
          ctx: { canRespond: false, onOpenUrl: openMapSearchProviderUrl },
        })}
      </>
    );
  }

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
