'use client';

import { useState } from 'react';
import { useConfirmAction } from '@agiworkforce/ui';
import type { DeveloperApprovalDecision } from '@agiworkforce/local-runtime-contract';
import {
  LOCAL_APPROVAL_DECISION_LABELS,
  LOCAL_APPROVAL_RISK_LABELS,
  LOCAL_CODE_COPY,
  localApprovalDecisions,
  type LocalApproval,
} from '../local-code';
import styles from '../CloudCodePage.module.css';

export interface LocalApprovalCardProps {
  approval: LocalApproval;
  folder: string;
  waiting: number;
  /** False on a shell that reads only allow or deny, which would downgrade any other answer. */
  allDecisions: boolean;
  onDecide: (approval: LocalApproval, decision: DeveloperApprovalDecision) => Promise<void>;
}

/**
 * One pending approval: what the agent wants to run, where, how risky the CLI
 * says it is, and every answer the CLI accepts. A rule that outlives this
 * request is confirmed first, naming what it will let run from then on.
 */
const PLAIN_DECISIONS: readonly DeveloperApprovalDecision[] = ['approve_once', 'deny'];

export function LocalApprovalCard({
  approval,
  folder,
  waiting,
  allDecisions,
  onDecide,
}: LocalApprovalCardProps) {
  const [answering, setAnswering] = useState(false);
  const { confirm, dialog } = useConfirmAction();
  const prefix = approval.proposedCommandPrefix?.length ? approval.proposedCommandPrefix : null;

  const answer = async (decision: DeveloperApprovalDecision) => {
    setAnswering(true);
    try {
      await onDecide(approval, decision);
    } finally {
      setAnswering(false);
    }
  };

  const choose = (decision: DeveloperApprovalDecision) => {
    if (decision !== 'always_allow_command' || !prefix) {
      void answer(decision);
      return;
    }
    confirm({
      title: LOCAL_CODE_COPY.alwaysAllowTitle,
      description: LOCAL_CODE_COPY.alwaysAllowBody(prefix.join(' ')),
      confirmLabel: LOCAL_CODE_COPY.alwaysAllowConfirm,
      onConfirm: () => answer(decision),
    });
  };

  const facts: string[] = [];
  if (approval.riskLevel) facts.push(LOCAL_APPROVAL_RISK_LABELS[approval.riskLevel]);
  if (approval.reversible === false) facts.push(LOCAL_CODE_COPY.approvalIrreversible);
  const shown = approval.command ?? (approval.detail || approval.summary);

  return (
    <div
      className={styles['approval']}
      role="group"
      aria-label={LOCAL_CODE_COPY.approvalHeading}
      data-testid="local-approval"
    >
      <span className={styles['approvalHeading']}>{LOCAL_CODE_COPY.approvalHeading}</span>
      <span>{approval.summary}</span>
      <pre className={styles['approvalCommand']}>{shown}</pre>
      <span>{[`${LOCAL_CODE_COPY.approvalFolder}: ${folder}`, ...facts].join(' · ')}</span>
      {approval.command !== null && approval.detail !== '' && approval.detail !== shown && (
        <pre className={styles['approvalCommand']}>{approval.detail}</pre>
      )}
      <div className={styles['approvalActions']}>
        {localApprovalDecisions(approval)
          .filter((decision) => allDecisions || PLAIN_DECISIONS.includes(decision))
          .map((decision) => (
            <button
              key={decision}
              type="button"
              className={
                decision === 'approve_once' ? styles['primaryButton'] : styles['secondaryButton']
              }
              disabled={answering}
              onClick={() => choose(decision)}
            >
              {LOCAL_APPROVAL_DECISION_LABELS[decision]}
            </button>
          ))}
      </div>
      {waiting > 0 && <span>{LOCAL_CODE_COPY.approvalMore(waiting)}</span>}
      {dialog}
    </div>
  );
}
