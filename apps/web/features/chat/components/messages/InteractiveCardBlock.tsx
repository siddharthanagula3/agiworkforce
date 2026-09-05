'use client';

import { memo, useEffect, useState } from 'react';
import { isAllowedMapSearchProviderUrl } from '@agiworkforce/cloud-contracts';
import {
  resolveInteractiveCardRenderer,
  type InteractiveCard,
  type InteractiveCardRegistry,
  type InteractiveCardRenderContext,
  type InteractiveCardResponsePayload,
} from '@agiworkforce/types';
import {
  interactiveCardAcceptsResponse,
  interactiveCardNeedsResume,
  interactiveCardResponseDeadlineMs,
} from '@/app/api/interactive-cards/response-contract';
import {
  respondToInteractiveCard,
  useInteractiveCardResume,
  type InteractiveCardResponseBinding,
  type WebInteractiveCardKind,
} from '@/lib/hooks/useChatStream';
import { selectIsActiveConversationStreaming, useChatStore } from '@shared/stores/web-chat-store';
import { cn } from '@shared/lib/utils';
import { ClarifyCard, type ClarifyCardContext } from './cards/ClarifyCard';
import { MapSearchCardLazy, PlacesMapCardLazy } from './cards/lazyMapCards';
import { McpAppCard } from './cards/McpAppCard';

type WebCardRegistry = {
  readonly [K in WebInteractiveCardKind]: NonNullable<InteractiveCardRegistry<React.ReactNode>[K]>;
};

const WEB_CARD_REGISTRY: WebCardRegistry = {
  'clarify.v1': ({ card, body, ctx }) => (
    <ClarifyCard card={card} body={body} ctx={ctx as ClarifyCardContext} />
  ),
  'map-search.v1': ({ body, ctx }) => <MapSearchCardLazy body={body} ctx={ctx} />,
  'mcp-app.v1': ({ body }) => <McpAppCard body={body} />,
  'places.v1': ({ body, ctx }) => (
    <PlacesMapCardLazy body={body} assistantText={(ctx as WebCardContext).assistantText} />
  ),
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

function useCardSubmissionError(cardId: string): string | undefined {
  return useChatStore(
    (state) =>
      state.messages.find((message) =>
        message.metadata?.interactiveCards?.some((card) => card.cardId === cardId),
      )?.metadata?.interactiveCardSubmissionErrors?.[cardId],
  );
}

function useCardTurnResume(
  card: InteractiveCard,
  channel: Omit<InteractiveCardResponseBinding, 'cardId'> | null,
): void {
  const resumeCardTurn = useInteractiveCardResume();
  const needsResume = card.recognized && interactiveCardNeedsResume(card);
  const conversationId = channel?.conversationId;
  const messageId = channel?.messageId;

  useEffect(() => {
    if (!needsResume || !conversationId || !messageId || !resumeCardTurn) return;
    void resumeCardTurn(messageId);
  }, [needsResume, conversationId, messageId, resumeCardTurn]);
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

type WebCardContext = InteractiveCardRenderContext & { assistantText?: string };

interface InteractiveCardBlockProps {
  cards: readonly InteractiveCard[];
  className?: string;
  /**
   * The answer this turn wrote. A place popup quotes the sentence about that
   * place from it, so an editorial line beside sourced data is verifiably the
   * assistant's own words.
   */
  assistantText?: string;
}

interface SingleCardProps {
  card: InteractiveCard;
  assistantText?: string;
}

const SingleCard = memo(function SingleCard({ card, assistantText }: SingleCardProps) {
  const renderer = resolveInteractiveCardRenderer(WEB_CARD_REGISTRY, card);
  const channel = useCardResponseChannel(card.cardId);
  const submissionError = useCardSubmissionError(card.cardId);
  useCardResponseDeadline(card);
  useCardTurnResume(card, channel);
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
            ...(submissionError ? { submissionError } : {}),
            ...(assistantText ? { assistantText } : {}),
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
  assistantText,
}: InteractiveCardBlockProps) {
  if (cards.length === 0) return null;
  return (
    <div className={className}>
      {cards.map((card) => (
        <SingleCard key={card.cardId} card={card} assistantText={assistantText} />
      ))}
    </div>
  );
});
InteractiveCardBlock.displayName = 'InteractiveCardBlock';
