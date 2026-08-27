'use client';

import { memo, useEffect, useState } from 'react';
import { isAllowedMapSearchProviderUrl } from '@agiworkforce/cloud-contracts';
import {
  resolveInteractiveCardRenderer,
  type InteractiveCard,
  type InteractiveCardRegistry,
  type InteractiveCardResponsePayload,
} from '@agiworkforce/types';
import {
  interactiveCardAcceptsResponse,
  interactiveCardResponseDeadlineMs,
} from '@/app/api/interactive-cards/response-contract';
import {
  respondToInteractiveCard,
  type InteractiveCardResponseBinding,
  type WebInteractiveCardKind,
} from '@/lib/hooks/useChatStream';
import { selectIsActiveConversationStreaming, useChatStore } from '@shared/stores/web-chat-store';
import { cn } from '@shared/lib/utils';
import { ClarifyCard, type ClarifyCardContext } from './cards/ClarifyCard';
import { MapSearchCard } from './cards/MapSearchCard';
import { McpAppCard } from './cards/McpAppCard';

type WebCardRegistry = {
  readonly [K in WebInteractiveCardKind]: NonNullable<InteractiveCardRegistry<React.ReactNode>[K]>;
};

const WEB_CARD_REGISTRY: WebCardRegistry = {
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

function useCardResponseChannel(
  cardId: string,
): Omit<InteractiveCardResponseBinding, 'cardId'> | null {
  const conversationId = useChatStore((state) => state.activeConversationId);
  const isTemporary = useChatStore(
    (state) =>
      state.conversations.find((conversation) => conversation.id === state.activeConversationId)
        ?.isTemporary ?? false,
  );
  const isStreaming = useChatStore(selectIsActiveConversationStreaming);
  const messageId = useChatStore(
    (state) =>
      state.messages.find((message) =>
        message.metadata?.interactiveCards?.some((card) => card.cardId === cardId),
      )?.id ?? null,
  );

  if (!conversationId || !messageId || isTemporary || isStreaming) return null;
  return { conversationId, messageId };
}

function useCardResponseDeadline(card: InteractiveCard): void {
  const [, setElapsedDeadlines] = useState(0);
  const deadlineMs = interactiveCardResponseDeadlineMs(card);

  useEffect(() => {
    if (deadlineMs === null) return;
    const delay = deadlineMs - Date.now();
    if (delay <= 0) return;
    const timer = setTimeout(() => setElapsedDeadlines((count) => count + 1), delay);
    return () => clearTimeout(timer);
  }, [deadlineMs]);
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
  const channel = useCardResponseChannel(card.cardId);
  useCardResponseDeadline(card);
  const canRespond = channel !== null && interactiveCardAcceptsResponse(card);

  if (renderer && card.recognized) {
    const onRespond = (cardId: string, payload: InteractiveCardResponsePayload) => {
      if (!channel) return;
      void respondToInteractiveCard({ ...channel, cardId }, payload);
    };

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
          ctx: {
            canRespond,
            ...(canRespond ? { onRespond } : {}),
            onOpenUrl: openMapSearchProviderUrl,
          },
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
