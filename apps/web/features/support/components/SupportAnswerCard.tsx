'use client';

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
