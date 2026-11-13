'use client';

import { memo, useEffect, useState } from 'react';
import { isAllowedMapSearchProviderUrl } from '@agiworkforce/cloud-contracts';
import {
  resolveInteractiveCardRenderer,
  type InteractiveCard,
  type InteractiveCardRegistry,
  type InteractiveCardRenderContext,
  type AnswerUiValue,
  type InteractiveCardResponsePayload,
} from '@agiworkforce/types';
import {
  interactiveCardAcceptsResponse,
  interactiveCardNeedsResume,
  interactiveCardResponseDeadlineMs,
} from '@/app/api/interactive-cards/response-contract';
import {
  useInteractiveCardResume,
  type InteractiveCardResponseBinding,
  type WebInteractiveCardKind,
} from '@/lib/hooks/useChatStream';
import { selectIsActiveConversationStreaming, useChatStore } from '@shared/stores/web-chat-store';
import { cn } from '@shared/lib/utils';
import { useOptionalChatStreamRuntime } from '../ChatStreamRuntimeProvider';
import { ClarifyCard, type ClarifyCardContext } from './cards/ClarifyCard';
import { ImageToolCard } from './cards/ImageToolCard';
import { ItineraryCardLazy, MapSearchCardLazy, PlacesMapCardLazy } from './cards/LazyMapCards';
import { McpAppCard } from './cards/McpAppCard';
import { ProductComparisonCard } from './cards/ProductComparisonCard';

type WebCardRegistry = {
  readonly [K in WebInteractiveCardKind]: NonNullable<InteractiveCardRegistry<React.ReactNode>[K]>;
};

const WEB_CARD_REGISTRY: WebCardRegistry = {
  'answer-ui.v1': ({ card, body, ctx }) => (
    <AnswerUiCard body={body} label={card.fallback.headline} ctx={ctx as AnswerUiCardContext} />
  ),
  'clarify.v1': ({ card, body, ctx }) => (
    <ClarifyCard card={card} body={body} ctx={ctx as ClarifyCardContext} />
  ),
  'image.v1': ({ body }) => <ImageToolCard body={body} />,
  'itinerary.v1': ({ body }) => <ItineraryCardLazy body={body} />,
  'map-search.v1': ({ body, ctx }) => <MapSearchCardLazy body={body} ctx={ctx} />,
  'mcp-app.v1': ({ body }) => <McpAppCard body={body} />,
  'places.v1': ({ body, ctx }) => (
    <PlacesMapCardLazy body={body} assistantText={(ctx as WebCardContext).assistantText} />
  ),
  'product-comparison.v1': ({ body }) => <ProductComparisonCard body={body} />,
};

function openMapSearchProviderUrl(value: string): void {
  if (!isAllowedMapSearchProviderUrl(value)) return;
  window.open(new URL(value).toString(), '_blank', 'noopener,noreferrer');
}

export const ANSWER_UI_SEND_WAITS_FOR_REPLY = 'Available when the reply finishes.';
export const ANSWER_UI_SEND_NEEDS_SAVED_CHAT = 'Buttons that send a message work in saved chats.';

function useCardSendBlockedReason(): string | undefined {
  const isStreaming = useChatStore(selectIsActiveConversationStreaming);
  const isTemporary = useChatStore(
    (state) =>
      state.conversations.find((conversation) => conversation.id === state.activeConversationId)
        ?.isTemporary ?? false,
  );
  if (isStreaming) return ANSWER_UI_SEND_WAITS_FOR_REPLY;
  if (isTemporary) return ANSWER_UI_SEND_NEEDS_SAVED_CHAT;
  return undefined;
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

interface InteractiveCardBlockProps {
  cards: readonly InteractiveCard[];
  className?: string;
  /**
   * The answer this turn wrote. A place popup quotes the sentence about that
   * place from it, so an editorial line beside sourced data is verifiably the
   * assistant's own words.
   */
  assistantText?: string;
  trustedImageUrls?: readonly string[];
}

interface SingleCardProps {
  card: InteractiveCard;
  assistantText?: string;
  trustedImageUrls?: readonly string[];
}

const SingleCard = memo(function SingleCard({
  card,
  assistantText,
  trustedImageUrls,
}: SingleCardProps) {
  const renderer = resolveInteractiveCardRenderer(WEB_CARD_REGISTRY, card);
  const channel = useCardResponseChannel(card.cardId);
  const sendBlockedReason = useCardSendBlockedReason();
  const sendFollowUp = useAnswerUiFollowUp();
  const submissionError = useCardSubmissionError(card.cardId);
  const runtime = useOptionalChatStreamRuntime();
  const binding = channel ? { ...channel, cardId: card.cardId } : null;
  const submitting = binding
    ? (runtime?.isInteractiveCardResponsePending(binding) ?? false)
    : false;
  useCardResponseDeadline(card);
  useCardTurnResume(card, runtime ? channel : null);
  const canRespond = runtime !== null && channel !== null && interactiveCardAcceptsResponse(card);

  if (renderer && card.recognized) {
    const onRespond = (cardId: string, payload: InteractiveCardResponsePayload) => {
      if (!runtime || !channel || !canRespond || submitting || cardId !== card.cardId) return;
      void runtime.respondToInteractiveCard({ ...channel, cardId }, payload);
    };

    const canSendMessage =
      channel !== null &&
      sendFollowUp !== null &&
      isUuid(channel.conversationId) &&
      isUuid(channel.messageId);
    const onSendMessage = async (actionId: string, values: Record<string, AnswerUiValue>) => {
      if (!channel || !sendFollowUp) return;
      const text = await requestAnswerUiMessage(
        { ...channel, cardId: card.cardId },
        actionId,
        values,
      );
      sendFollowUp(text);
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
            submitting,
            ...(submissionError ? { submissionError } : {}),
            ...(assistantText ? { assistantText } : {}),
            ...(trustedImageUrls ? { trustedImageUrls } : {}),
            canSend: canSendMessage,
            ...(canSendMessage ? { onSendMessage } : {}),
            ...(sendBlockedReason ? { sendBlockedReason } : {}),
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
  trustedImageUrls,
}: InteractiveCardBlockProps) {
  if (cards.length === 0) return null;
  return (
    <div className={className}>
      {cards.map((card) => (
        <SingleCard
          key={card.cardId}
          card={card}
          assistantText={assistantText}
          trustedImageUrls={trustedImageUrls}
        />
      ))}
    </div>
  );
});
InteractiveCardBlock.displayName = 'InteractiveCardBlock';
