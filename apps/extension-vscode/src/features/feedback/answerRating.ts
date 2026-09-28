import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import { modelDisplayLabel } from '../model-picker/modelConstants';
import { submitAnswerRating, type AnswerRating, type FeedbackOutcome } from './submitFeedback';

const REMEMBERED_RATINGS_KEY = 'agiWorkforce.answerRatings';
const REMEMBERED_RATINGS_LIMIT = 500;

interface RatedAnswer {
  messageId: string;
  conversationId?: string;
  model?: string;
}

function ratedAnswerFields(answer: RatedAnswer): Parameters<typeof submitAnswerRating>[2] {
  return {
    messageId: answer.messageId,
    ...(answer.conversationId === undefined ? {} : { conversationId: answer.conversationId }),
    ...(answer.model === undefined ? {} : { modelLabel: modelDisplayLabel(answer.model) }),
  };
}

export function answerRatingId(threadId: string, answerText: string): string {
  return createHash('sha256').update(`${threadId}\n${answerText}`).digest('hex').slice(0, 32);
}

function rememberedRatings(state: vscode.Memento): Record<string, AnswerRating> {
  return state.get<Record<string, AnswerRating>>(REMEMBERED_RATINGS_KEY, {});
}

export function rememberedAnswerRating(
  state: vscode.Memento,
  messageId: string,
): AnswerRating | undefined {
  return rememberedRatings(state)[messageId];
}

async function rememberAnswerRating(
  state: vscode.Memento,
  messageId: string,
  rating: AnswerRating | null,
): Promise<void> {
  const others = Object.entries(rememberedRatings(state)).filter(([id]) => id !== messageId);
  const entries = rating === null ? others : [...others, [messageId, rating] as const];
  await state.update(
    REMEMBERED_RATINGS_KEY,
    Object.fromEntries(entries.slice(-REMEMBERED_RATINGS_LIMIT)),
  );
}

async function reportRatingOutcome(outcome: FeedbackOutcome): Promise<void> {
  if (outcome.status === 'sent') return;
  if (outcome.status === 'signed-out') {
    const choice = await vscode.window.showWarningMessage(
      'AGI Workforce: sign in to AGI Cloud to rate answers from VS Code.',
      'Sign in',
    );
    if (choice === 'Sign in') await vscode.commands.executeCommand('agi-workforce.signIn');
    return;
  }
  void vscode.window.showErrorMessage(
    `AGI Workforce: your rating was not sent, ${outcome.reason}. Try again in a moment.`,
  );
}

export async function applyAnswerRating(
  secrets: vscode.SecretStorage,
  state: vscode.Memento,
  rating: AnswerRating | null,
  answer: RatedAnswer,
): Promise<AnswerRating | null> {
  const previous = rememberedAnswerRating(state, answer.messageId) ?? null;
  if (rating === previous) return previous;
  if (rating === null) {
    await rememberAnswerRating(state, answer.messageId, null);
    return null;
  }
  const outcome = await submitAnswerRating(secrets, rating, ratedAnswerFields(answer));
  if (outcome.status === 'sent') {
    await rememberAnswerRating(state, answer.messageId, rating);
    return rating;
  }
  await reportRatingOutcome(outcome);
  return previous;
}

function stringField(
  metadata: Record<string, unknown> | undefined,
  name: string,
): string | undefined {
  const value = metadata?.[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export async function rateParticipantAnswer(
  secrets: vscode.SecretStorage,
  feedback: vscode.ChatResultFeedback,
): Promise<void> {
  const metadata = feedback.result.metadata;
  const turnId = stringField(metadata, 'localTurnId');
  if (turnId === undefined) return;
  const conversationId = stringField(metadata, 'localThreadId');
  const model = stringField(metadata, 'localThreadModel');
  const outcome = await submitAnswerRating(
    secrets,
    feedback.kind === vscode.ChatResultFeedbackKind.Helpful ? 'up' : 'down',
    ratedAnswerFields({
      messageId: turnId,
      ...(conversationId === undefined ? {} : { conversationId }),
      ...(model === undefined ? {} : { model }),
    }),
  );
  await reportRatingOutcome(outcome);
}
