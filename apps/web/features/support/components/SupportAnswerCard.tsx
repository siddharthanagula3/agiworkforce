'use client';

/**
 * A cited answer.
 *
 * There is no "answer with no sources" branch here, and there must never be
 * one: `normalizeAnswer` guarantees `citations.length >= 1` before an
 * `SupportAnswerView` exists. The assertion below is a runtime backstop, not a
 * rendering strategy — if it ever fires, the bug is upstream.
 */

import type { SupportAnswerView } from '../lib/contract';
import { renderSupportText } from '../lib/render-text';
import { SupportCitationList } from './SupportCitationList';
import styles from './SupportWidget.module.css';

export function SupportAnswerCard({ answer }: { answer: SupportAnswerView }) {
  if (answer.citations.length === 0) return null;

  return (
    <div className={styles['answer']} data-support-message="answer">
      {renderSupportText(answer.text)}
      <SupportCitationList citations={answer.citations} />
    </div>
  );
}
