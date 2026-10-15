'use client';

import { useId, useState } from 'react';
import { CODE_LIMITS } from '../code-surface';
import { LOCAL_CODE_COPY, type LocalQuestion } from '../local-code';
import styles from '../CloudCodePage.module.css';

export interface LocalQuestionCardProps {
  question: LocalQuestion;
  waiting: number;
  onAnswer: (question: LocalQuestion, answer: string | null) => Promise<void>;
}

/** A question the agent asked mid-turn. The turn waits here until it is answered or skipped. */
export function LocalQuestionCard({ question, waiting, onAnswer }: LocalQuestionCardProps) {
  const [answer, setAnswer] = useState('');
  const [sending, setSending] = useState(false);
  const fieldId = useId();

  const send = async (value: string | null) => {
    setSending(true);
    try {
      await onAnswer(question, value);
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      className={styles['approval']}
      aria-label={LOCAL_CODE_COPY.questionHeading}
      data-testid="local-question"
      onSubmit={(event) => {
        event.preventDefault();
        if (answer.trim() !== '') void send(answer.trim());
      }}
    >
      <span className={styles['approvalHeading']}>{LOCAL_CODE_COPY.questionHeading}</span>
      <span>{question.question}</span>
      <label htmlFor={fieldId}>{LOCAL_CODE_COPY.answerLabel}</label>
      <textarea
        id={fieldId}
        className={styles['textInput']}
        value={answer}
        rows={2}
        maxLength={CODE_LIMITS.task}
        onChange={(event) => setAnswer(event.target.value)}
      />
      <div className={styles['approvalActions']}>
        <button
          type="button"
          className={styles['secondaryButton']}
          disabled={sending}
          onClick={() => void send(null)}
        >
          {LOCAL_CODE_COPY.skipQuestion}
        </button>
        <button
          type="submit"
          className={styles['primaryButton']}
          disabled={sending || answer.trim() === ''}
        >
          {LOCAL_CODE_COPY.sendAnswer}
        </button>
      </div>
      {waiting > 0 && <span>{LOCAL_CODE_COPY.questionMore(waiting)}</span>}
    </form>
  );
}
