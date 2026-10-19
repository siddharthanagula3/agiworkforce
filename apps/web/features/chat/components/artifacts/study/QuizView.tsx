'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, Lightbulb, RotateCcw, Sparkles, XCircle } from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { gradeShortAnswer, type Quiz, type QuizQuestion } from './study-set';

interface AnswerState {
  choice: number | null;
  typed: string;
  submitted: boolean;
  correct: boolean;
  hints: number;
}

const EMPTY: AnswerState = { choice: null, typed: '', submitted: false, correct: false, hints: 0 };

export function buildQuizFollowUp(quiz: Quiz, answers: readonly AnswerState[]): string {
  const missed = quiz.questions
    .map((question, index) => ({ question, answer: answers[index] ?? EMPTY, index }))
    .filter((entry) => entry.answer.submitted && !entry.answer.correct);
  const score = answers.filter((answer) => answer.correct).length;
  const lines = [
    `I finished the quiz "${quiz.title || 'Quiz'}" and scored ${score} of ${quiz.questions.length}.`,
  ];
  if (missed.length === 0) {
    lines.push(
      'I got everything right. What should I study next to go further, based on the same material?',
    );
  } else {
    lines.push(
      'Explain the questions I got wrong using the source material we have been working from, and point to where in the sources each answer comes from:',
      '',
    );
    for (const entry of missed) {
      const given =
        entry.question.kind === 'multiple_choice'
          ? (entry.question.options[entry.answer.choice ?? -1] ?? 'no answer')
          : entry.answer.typed || 'no answer';
      lines.push(`${entry.index + 1}. ${entry.question.question} (I answered: ${given})`);
    }
  }
  return lines.join('\n');
}

function correctAnswerText(question: QuizQuestion): string {
  return question.kind === 'multiple_choice' ? question.options[question.answer]! : question.answer;
}

export function QuizView({ quiz, onAsk }: { quiz: Quiz; onAsk?: (prompt: string) => boolean }) {
  const [answers, setAnswers] = useState<AnswerState[]>(() => quiz.questions.map(() => EMPTY));
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const total = quiz.questions.length;
  const question = quiz.questions[Math.min(index, total - 1)]!;
  const state = answers[index] ?? EMPTY;
  const score = useMemo(() => answers.filter((answer) => answer.correct).length, [answers]);

  const patch = (next: Partial<AnswerState>) =>
    setAnswers((current) =>
      current.map((answer, i) => (i === index ? { ...answer, ...next } : answer)),
    );

  const check = (event: FormEvent) => {
    event.preventDefault();
    if (state.submitted) return;
    const correct =
      question.kind === 'multiple_choice'
        ? state.choice === question.answer
        : gradeShortAnswer(question, state.typed);
    patch({ submitted: true, correct });
  };

  const canCheck =
    question.kind === 'multiple_choice' ? state.choice !== null : state.typed.trim().length > 0;

  const restart = () => {
    setAnswers(quiz.questions.map(() => EMPTY));
    setIndex(0);
    setFinished(false);
  };

  if (finished) {
    const missed = quiz.questions.filter((_, i) => !answers[i]?.correct);
    return (
      <section
        className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card p-4"
        aria-label={`${quiz.title || 'Quiz'} results`}
        data-testid="quiz-results"
      >
        <h3 className="text-base font-semibold text-foreground">
          You scored {score} of {total}
        </h3>
        {missed.length > 0 ? (
          <ol className="flex flex-col gap-2">
            {missed.map((entry) => {
              const position = quiz.questions.indexOf(entry);
              return (
                <li key={position} className="text-sm text-foreground">
                  <p className="font-medium">
                    {position + 1}. {entry.question}
                  </p>
                  <p className="text-muted-foreground">Answer: {correctAnswerText(entry)}</p>
                  {entry.explanation ? (
                    <p className="text-muted-foreground">{entry.explanation}</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Every answer was right.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={restart}>
            <RotateCcw className="me-1 h-3.5 w-3.5" aria-hidden="true" />
            Retake
          </Button>
          {onAsk ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAsk(buildQuizFollowUp(quiz, answers))}
              data-testid="quiz-follow-up"
            >
              <Sparkles className="me-1 h-3.5 w-3.5" aria-hidden="true" />
              {missed.length > 0 ? 'Explain what I missed' : 'What should I study next?'}
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  const optionState = (option: number) => {
    if (!state.submitted) return state.choice === option ? 'chosen' : 'idle';
    if (option === (question.kind === 'multiple_choice' ? question.answer : -1)) return 'correct';
    return state.choice === option ? 'wrong' : 'idle';
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-border/50 bg-card p-4"
      aria-label={quiz.title || 'Quiz'}
      data-testid="quiz-view"
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{quiz.title || 'Quiz'}</span>
        <span className="tabular-nums">
          Question {index + 1} of {total}
        </span>
      </div>
      <form onSubmit={check} className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-base font-medium text-foreground">
            {question.question}
          </legend>
          {question.kind === 'multiple_choice' ? (
            question.options.map((option, optionIndex) => {
              const look = optionState(optionIndex);
              return (
                <label
                  key={optionIndex}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm text-foreground transition-colors',
                    look === 'idle' && 'border-border/60 hover:bg-[var(--chat-surface-hover)]',
                    look === 'chosen' &&
                      'border-[var(--chat-border-strong)] bg-[var(--chat-surface-hover)]',
                    look === 'correct' && 'border-success-text bg-success-fill/10',
                    look === 'wrong' && 'border-danger-text bg-danger-fill/10',
                    state.submitted && 'cursor-default',
                  )}
                >
                  <input
                    type="radio"
                    name={`quiz-question-${index}`}
                    checked={state.choice === optionIndex}
                    disabled={state.submitted}
                    onChange={() => patch({ choice: optionIndex })}
                    className="h-4 w-4"
                  />
                  <span className="flex-1">{option}</span>
                  {look === 'correct' ? (
                    <CheckCircle2
                      className="h-4 w-4 text-success-text"
                      aria-label="Correct answer"
                    />
                  ) : look === 'wrong' ? (
                    <XCircle className="h-4 w-4 text-danger-text" aria-label="Your answer" />
                  ) : null}
                </label>
              );
            })
          ) : (
            <>
              <label htmlFor={`quiz-answer-${index}`} className="sr-only">
                Your answer
              </label>
              <input
                id={`quiz-answer-${index}`}
                value={state.typed}
                disabled={state.submitted}
                onChange={(event) => patch({ typed: event.target.value })}
                placeholder="Type your answer"
                autoComplete="off"
                className="min-h-11 rounded-lg border border-border/60 bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </>
          )}
        </fieldset>

        {question.hints.length > 0 && !state.submitted ? (
          <div className="flex flex-col gap-1.5">
            {question.hints.slice(0, state.hints).map((hint, hintIndex) => (
              <p
                key={hintIndex}
                className="flex items-start gap-2 rounded-lg bg-[var(--chat-surface-hover)] px-3 py-2 text-sm text-foreground"
              >
                <Lightbulb
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span>
                  <span className="sr-only">Hint {hintIndex + 1}: </span>
                  {hint}
                </span>
              </p>
            ))}
            {state.hints < question.hints.length ? (
              <button
                type="button"
                onClick={() => patch({ hints: state.hints + 1 })}
                className="self-start min-h-11 rounded-md px-2 text-sm text-foreground underline underline-offset-2 sm:min-h-8"
                data-testid="quiz-hint"
              >
                {state.hints === 0 ? 'Show a hint' : 'Show another hint'} ({state.hints}/
                {question.hints.length})
              </button>
            ) : null}
          </div>
        ) : null}

        {state.submitted ? (
          <div
            role="status"
            className={cn(
              'flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm',
              state.correct ? 'border-success-text' : 'border-danger-text',
            )}
            data-testid="quiz-feedback"
          >
            <p
              className={cn(
                'font-medium',
                state.correct ? 'text-success-text' : 'text-danger-text',
              )}
            >
              {state.correct
                ? 'Correct.'
                : `Not quite. The answer is ${correctAnswerText(question)}.`}
            </p>
            {question.explanation ? (
              <p className="text-foreground">{question.explanation}</p>
            ) : null}
            {!state.correct && question.kind === 'short_answer' && onAsk ? (
              <button
                type="button"
                onClick={() =>
                  onAsk(
                    `For the question "${question.question}" I answered "${state.typed}". The expected answer is "${question.answer}". Is my answer also correct, or where did it go wrong?`,
                  )
                }
                className="self-start text-sm text-foreground underline underline-offset-2"
              >
                Ask whether my wording also counts
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {!state.submitted ? (
            <Button type="submit" size="sm" disabled={!canCheck} data-testid="quiz-check">
              Check answer
            </Button>
          ) : index < total - 1 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setIndex(index + 1)}
              data-testid="quiz-next"
            >
              Next question
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => setFinished(true)}
              data-testid="quiz-finish"
            >
              See results
            </Button>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">{score} correct so far</span>
        </div>
      </form>
    </section>
  );
}
