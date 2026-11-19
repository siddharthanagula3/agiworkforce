import type { InteractiveCard } from '@agiworkforce/types';

const INVISIBLE_CHARACTERS = /[\u200B-\u200D\u2060\uFEFF]/g;

export const EMPTY_ASSISTANT_TURN_HISTORY_TEXT =
  '[This reply had no text. Anything it produced was shown to the user as a card, image or file.]';

export function hasVisibleHistoryText(content: string | null | undefined): boolean {
  return typeof content === 'string' && content.replace(INVISIBLE_CHARACTERS, '').trim().length > 0;
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 200);
}

export function cardOnlyAssistantHistoryText(
  cards: readonly Pick<InteractiveCard, 'fallback'>[],
): string | null {
  const shown = cards
    .map((card) => singleLine(card.fallback?.headline ?? ''))
    .filter((headline) => headline.length > 0);
  if (shown.length === 0) return null;
  return `[This reply had no text. It showed the user ${shown.length === 1 ? 'a card' : 'cards'}: ${shown
    .map((headline) => JSON.stringify(headline))
    .join(', ')}. That request is answered.]`;
}

interface HistoryMessageLike {
  role: string;
  content: unknown;
  tool_calls?: unknown[] | undefined;
}

function carriesVisibleContent(content: unknown): boolean {
  if (typeof content === 'string') return hasVisibleHistoryText(content);
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    if (!part || typeof part !== 'object') return false;
    const record = part as { type?: unknown; text?: unknown };
    if (record.type === 'text') return hasVisibleHistoryText(record.text as string | undefined);
    return true;
  });
}

/**
 * An assistant turn with no text reaches a provider as an empty message, which
 * one provider rejects and others drop. Dropped, the user request it answered
 * reads as still open, and the next turn answers it again.
 */
export function fillEmptyAssistantTurns<T extends HistoryMessageLike>(messages: readonly T[]): T[] {
  return messages.map((message) => {
    if (message.role !== 'assistant') return message;
    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) return message;
    if (carriesVisibleContent(message.content)) return message;
    return { ...message, content: EMPTY_ASSISTANT_TURN_HISTORY_TEXT };
  });
}

export function cardOnlyAssistantTurnContent(message: {
  role: string;
  content: string;
  metadata?: { interactiveCards?: readonly Pick<InteractiveCard, 'fallback'>[] } | undefined;
}): string | null {
  if (message.role !== 'assistant' || hasVisibleHistoryText(message.content)) return null;
  return cardOnlyAssistantHistoryText(message.metadata?.interactiveCards ?? []);
}
