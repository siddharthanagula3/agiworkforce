'use client';

/**
 * The conversation log.
 *
 * `role="log"` with `aria-live="polite"` announces a completed turn once,
 * rather than per token — there is no streaming here on purpose, so screen
 * readers get one coherent announcement instead of a stutter. `aria-busy`
 * covers the pending window.
 *
 * Action affordances are rendered ONLY for signed-in visitors, and only when
 * the server's available-action list actually contains the id the answer
 * proposed. A marketing visitor with an answer that happens to carry a
 * `proposedActionId` sees nothing actionable.
 */

import type { SupportTurn } from '../lib/contract';
import type { SupportActionFlow } from '../hooks/useSupportSession';
import { SupportAbstentionCard } from './SupportAbstentionCard';
import { SupportActionConfirm } from './SupportActionConfirm';
import { SupportAnswerCard } from './SupportAnswerCard';
import styles from './SupportWidget.module.css';

export function SupportTranscript({
  turns,
  pending,
  actionFlows,
  actionTitles,
  signedIn,
  onPrepare,
  onConfirm,
  onCancel,
  onEscalate,
}: {
  turns: SupportTurn[];
  pending: boolean;
  actionFlows: Record<string, SupportActionFlow>;
  actionTitles: Record<string, string>;
  signedIn: boolean;
  onPrepare: (turnId: string, actionId: string) => void;
  onConfirm: (turnId: string) => void;
  onCancel: (turnId: string) => void;
  onEscalate: (turnId: string) => void;
}) {
  return (
    <div
      className={styles['transcript']}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-busy={pending}
      aria-label="Support conversation"
    >
      {turns.length === 0 ? (
        <p className={styles['intro']}>
          Ask a question about the product. I answer from the documentation and always show you
          where the answer came from. If I do not have a source, I will say so and pass you to a
          person instead of guessing.
        </p>
      ) : null}

      {turns.map((turn) => {
        if (turn.role === 'user') {
          return (
            <div key={turn.id} className={styles['userTurn']} data-support-message="user">
              {turn.text}
            </div>
          );
        }

        const { reply } = turn;
        const flow = actionFlows[turn.id];
        const proposedActionId = reply.kind === 'answer' ? reply.proposedActionId : null;
        const actionTitle = proposedActionId ? actionTitles[proposedActionId] : undefined;
        // An action is offerable only if the caller is signed in AND the server
        // advertised that exact id. The model's suggestion alone is not enough.
        const offerable = signedIn && proposedActionId !== null && actionTitle !== undefined;

        return (
          <div key={turn.id}>
            {reply.kind === 'answer' ? (
              <SupportAnswerCard answer={reply} />
            ) : (
              <SupportAbstentionCard
                abstention={reply}
                onEscalate={() => {
                  onEscalate(turn.id);
                }}
              />
            )}

            {offerable && proposedActionId ? (
              <SupportActionConfirm
                flow={flow ?? { phase: 'offered', actionId: proposedActionId }}
                actionTitle={actionTitle ?? proposedActionId}
                onPrepare={() => {
                  onPrepare(turn.id, proposedActionId);
                }}
                onConfirm={() => {
                  onConfirm(turn.id);
                }}
                onCancel={() => {
                  onCancel(turn.id);
                }}
              />
            ) : null}
          </div>
        );
      })}

      {pending ? (
        <p className={styles['intro']} data-support-pending="">
          Looking this up…
        </p>
      ) : null}
    </div>
  );
}
