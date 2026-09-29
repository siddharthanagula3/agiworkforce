import type {
  ClarifyCardBody,
  InteractiveCard,
  InteractiveCardClientCapability,
} from '@agiworkforce/types';

export const INTERACTIVE_CARD_RESPONSE_PATH = '/api/interactive-cards/respond';

export const MOBILE_INTERACTIVE_CARD_CAPABILITY: InteractiveCardClientCapability = {
  supported: ['clarify.v1', 'itinerary.v1', 'map-search.v1', 'image.v1'],
  canRespond: true,
};

const CLARIFY_ANSWERED_PREAMBLE = 'The user answered the clarifying questions:';
const CLARIFY_DISMISSED_PREAMBLE = 'The user declined the clarifying questions and said instead:';
const CLARIFY_DISMISSED_SILENTLY = 'The user declined the clarifying questions without answering.';

type ClarifyCard = Extract<InteractiveCard, { recognized: true; kind: 'clarify.v1' }>;

function isClarifyCard(card: InteractiveCard): card is ClarifyCard {
  return card.recognized && card.kind === 'clarify.v1';
}

export function clarifyResponseDeadlineMs(card: InteractiveCard): number | null {
  const expiresAt = card.interaction?.expiresAt;
  if (!expiresAt) return null;
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isFinite(expiresAtMs) ? expiresAtMs : null;
}

export function clarifyCardAcceptsResponse(card: InteractiveCard, nowMs = Date.now()): boolean {
  if (!isClarifyCard(card) || card.body.state.status !== 'pending') return false;
  if (card.body.questions.some((question) => question.isSecret)) return false;
  const { interaction } = card;
  if (!interaction) return true;
  if (!interaction.awaitingResponse) return false;
  const deadlineMs = clarifyResponseDeadlineMs(card);
  return deadlineMs !== null && deadlineMs > nowMs;
}

export function clarifyCardNeedsResume(card: InteractiveCard): boolean {
  return isClarifyCard(card) && card.body.state.status === 'answered';
}

function describeSettledClarify(body: ClarifyCardBody): string | null {
  const { questions, state } = body;
  if (state.status === 'dismissed') {
    return state.freeText
      ? `${CLARIFY_DISMISSED_PREAMBLE} ${state.freeText}`
      : CLARIFY_DISMISSED_SILENTLY;
  }
  if (state.status !== 'answered') return null;

  const lines = state.answers.flatMap((answer) => {
    const question = questions.find((candidate) => candidate.id === answer.questionId);
    if (!question || answer.kind === 'skipped') return [];
    const value = answer.kind === 'other' ? answer.text : answer.labels.join(', ');
    return value.length > 0 ? [`- ${question.question} ${value}`] : [];
  });

  return lines.length > 0 ? [CLARIFY_ANSWERED_PREAMBLE, ...lines].join('\n') : null;
}

export function settledClarifyTurn(cards: readonly InteractiveCard[]): string | null {
  const settled = cards
    .filter(isClarifyCard)
    .map((card) => describeSettledClarify(card.body))
    .filter((entry): entry is string => entry !== null);
  return settled.length > 0 ? settled.join('\n\n') : null;
}
