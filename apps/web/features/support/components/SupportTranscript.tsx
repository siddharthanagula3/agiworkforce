'use client';

import type { SupportTurn } from '@agiworkforce/cloud-contracts/support';
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
          Ask a question about AGI Workforce. I answer from the help articles and show you where the
          answer came from. If I do not have a source I say so, and you can send the question to a
          person. I cannot help with anything other than this product.
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
