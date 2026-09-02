import { z } from 'zod';
import {
  CLARIFY_MAX_OPTIONS,
  CLARIFY_MAX_QUESTIONS,
  CLARIFY_OTHER_MAX_LENGTH,
  type InteractiveCard,
  type KnownInteractiveCard,
  type KnownInteractiveCardKind,
} from '@agiworkforce/types';

export const INTERACTIVE_CARD_RESPONSE_PATH = '/api/interactive-cards/respond';

export const RESPONDABLE_INTERACTIVE_CARD_KIND = 'clarify.v1' satisfies KnownInteractiveCardKind;

export type RespondableInteractiveCard = Extract<
  KnownInteractiveCard,
  { kind: typeof RESPONDABLE_INTERACTIVE_CARD_KIND }
>;

const IdentifierSchema = z.string().min(1);

export const InteractiveCardResponsePayloadSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('answers'),
      answers: z
        .array(
          z
            .object({
              question_id: IdentifierSchema,
              option_ids: z.array(IdentifierSchema).max(CLARIFY_MAX_OPTIONS).optional(),
              text: z.string().max(CLARIFY_OTHER_MAX_LENGTH).optional(),
              skipped: z.boolean().optional(),
            })
            .strict(),
        )
        .min(1)
        .max(CLARIFY_MAX_QUESTIONS),
    })
    .strict(),
  z
    .object({
      kind: z.literal('dismiss'),
      text: z.string().optional(),
    })
    .strict(),
]);

export const InteractiveCardResponseRequestSchema = z
  .object({
    conversation_id: z.string().uuid(),
    message_id: z.string().uuid(),
    card_id: IdentifierSchema,
    response: InteractiveCardResponsePayloadSchema,
  })
  .strict();

export type InteractiveCardResponseRequest = z.infer<typeof InteractiveCardResponseRequestSchema>;

export function interactiveCardResponseDeadlineMs(card: InteractiveCard): number | null {
  const expiresAt = card.interaction?.expiresAt;
  if (!expiresAt) return null;
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) ? expiresAtMs : null;
}

export function interactiveCardAcceptsResponse(
  card: InteractiveCard,
  nowMs = Date.now(),
): card is RespondableInteractiveCard {
  if (!card.recognized || card.kind !== RESPONDABLE_INTERACTIVE_CARD_KIND) return false;
  if (card.body.state.status !== 'pending') return false;
  if (card.body.questions.some((question) => question.isSecret)) return false;
  const { interaction } = card;
  if (!interaction) return true;
  if (!interaction.awaitingResponse) return false;
  const deadlineMs = interactiveCardResponseDeadlineMs(card);
  return deadlineMs !== null && deadlineMs > nowMs;
}

export function interactiveCardNeedsResume(
  card: InteractiveCard,
): card is RespondableInteractiveCard {
  if (!card.recognized || card.kind !== RESPONDABLE_INTERACTIVE_CARD_KIND) return false;
  return card.body.state.status === 'answered';
}
