'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@agiworkforce/ui';
import type { Flashcard, FlashcardSet, Quiz, QuizQuestion } from './study-set';

const FIELD =
  'min-h-11 w-full rounded-md border border-border/60 bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9';

function EditorActions({
  onCancel,
  onSave,
  saveDisabled,
}: {
  onCancel: () => void;
  onSave: () => void;
  saveDisabled: boolean;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
      <Button size="sm" onClick={onSave} disabled={saveDisabled} data-testid="study-editor-save">
        Save
      </Button>
    </div>
  );
}

function blankQuestion(kind: QuizQuestion['kind']): QuizQuestion {
  return kind === 'multiple_choice'
    ? { kind, question: '', options: ['', ''], answer: 0, explanation: '', hints: [] }
    : { kind, question: '', answer: '', accept: [], explanation: '', hints: [] };
}

export function isQuizComplete(quiz: Quiz): boolean {
  return (
    quiz.questions.length > 0 &&
    quiz.questions.every((question) =>
      question.kind === 'multiple_choice'
        ? question.question.trim() !== '' &&
          question.options.filter((option) => option.trim()).length >= 2 &&
          (question.options[question.answer] ?? '').trim() !== ''
        : question.question.trim() !== '' && question.answer.trim() !== '',
    )
  );
}

export function QuizEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Quiz;
  onSave: (quiz: Quiz) => void;
  onCancel: () => void;
}) {
  const [quiz, setQuiz] = useState<Quiz>(initial);
  const update = (index: number, next: QuizQuestion) =>
    setQuiz((current) => ({
      ...current,
      questions: current.questions.map((question, i) => (i === index ? next : question)),
    }));

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-[var(--chat-border-strong)] bg-card p-4"
      aria-label="Edit quiz"
      data-testid="quiz-editor"
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Quiz title
        <input
          value={quiz.title}
          onChange={(event) => setQuiz({ ...quiz, title: event.target.value })}
          className={FIELD}
        />
      </label>
      <ol className="flex flex-col gap-3">
        {quiz.questions.map((question, index) => (
          <li key={index} className="flex flex-col gap-2 rounded-lg border border-border/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                Question {index + 1} ·{' '}
                {question.kind === 'multiple_choice' ? 'Multiple choice' : 'Short answer'}
              </span>
              <button
                type="button"
                onClick={() =>
                  setQuiz({ ...quiz, questions: quiz.questions.filter((_, i) => i !== index) })
                }
                aria-label={`Remove question ${index + 1}`}
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--chat-surface-hover)] sm:h-8 sm:w-8"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Question
              <input
                value={question.question}
                onChange={(event) => update(index, { ...question, question: event.target.value })}
                className={FIELD}
              />
            </label>
            {question.kind === 'multiple_choice' ? (
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1 text-xs text-muted-foreground">
                  Options, with the correct one selected
                </legend>
                {question.options.map((option, optionIndex) => (
                  <div key={optionIndex} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`quiz-editor-answer-${index}`}
                      checked={question.answer === optionIndex}
                      onChange={() => update(index, { ...question, answer: optionIndex })}
                      aria-label={`Option ${optionIndex + 1} is correct`}
                      className="h-4 w-4"
                    />
                    <input
                      value={option}
                      onChange={(event) =>
                        update(index, {
                          ...question,
                          options: question.options.map((value, i) =>
                            i === optionIndex ? event.target.value : value,
                          ),
                        })
                      }
                      aria-label={`Option ${optionIndex + 1}`}
                      className={FIELD}
                    />
                    <button
                      type="button"
                      disabled={question.options.length <= 2}
                      onClick={() =>
                        update(index, {
                          ...question,
                          options: question.options.filter((_, i) => i !== optionIndex),
                          answer:
                            question.answer === optionIndex
                              ? 0
                              : question.answer > optionIndex
                                ? question.answer - 1
                                : question.answer,
                        })
                      }
                      aria-label={`Remove option ${optionIndex + 1}`}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--chat-surface-hover)] disabled:opacity-30 sm:h-8 sm:w-8"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
                {question.options.length < 8 ? (
                  <button
                    type="button"
                    onClick={() =>
                      update(index, { ...question, options: [...question.options, ''] })
                    }
                    className="self-start min-h-11 rounded-md px-2 text-sm text-foreground hover:bg-[var(--chat-surface-hover)] sm:min-h-8"
                  >
                    Add option
                  </button>
                ) : null}
              </fieldset>
            ) : (
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Correct answer
                <input
                  value={question.answer}
                  onChange={(event) => update(index, { ...question, answer: event.target.value })}
                  className={FIELD}
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Explanation
              <textarea
                value={question.explanation}
                rows={2}
                onChange={(event) =>
                  update(index, { ...question, explanation: event.target.value })
                }
                className={`${FIELD} py-2`}
              />
            </label>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setQuiz({ ...quiz, questions: [...quiz.questions, blankQuestion('multiple_choice')] })
          }
        >
          <Plus className="me-1 h-3.5 w-3.5" aria-hidden="true" />
          Multiple choice
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setQuiz({ ...quiz, questions: [...quiz.questions, blankQuestion('short_answer')] })
          }
        >
          <Plus className="me-1 h-3.5 w-3.5" aria-hidden="true" />
          Short answer
        </Button>
      </div>
      {!isQuizComplete(quiz) ? (
        <p className="text-xs text-muted-foreground" role="status">
          Every question needs its text and a correct answer before it can be saved.
        </p>
      ) : null}
      <EditorActions
        onCancel={onCancel}
        onSave={() => onSave(quiz)}
        saveDisabled={!isQuizComplete(quiz)}
      />
    </section>
  );
}

export function FlashcardsEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: FlashcardSet;
  onSave: (set: FlashcardSet) => void;
  onCancel: () => void;
}) {
  const [set, setSet] = useState<FlashcardSet>(initial);
  const update = (index: number, next: Flashcard) =>
    setSet((current) => ({
      ...current,
      cards: current.cards.map((card, i) => (i === index ? next : card)),
    }));
  const complete =
    set.cards.length > 0 && set.cards.every((card) => card.front.trim() && card.back.trim());

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-[var(--chat-border-strong)] bg-card p-4"
      aria-label="Edit flashcards"
      data-testid="flashcards-editor"
    >
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Set title
        <input
          value={set.title}
          onChange={(event) => setSet({ ...set, title: event.target.value })}
          className={FIELD}
        />
      </label>
      <ol className="flex flex-col gap-2">
        {set.cards.map((card, index) => (
          <li key={index} className="flex items-start gap-2">
            <input
              value={card.front}
              onChange={(event) => update(index, { ...card, front: event.target.value })}
              aria-label={`Card ${index + 1} front`}
              className={FIELD}
            />
            <input
              value={card.back}
              onChange={(event) => update(index, { ...card, back: event.target.value })}
              aria-label={`Card ${index + 1} back`}
              className={FIELD}
            />
            <button
              type="button"
              onClick={() => setSet({ ...set, cards: set.cards.filter((_, i) => i !== index) })}
              aria-label={`Remove card ${index + 1}`}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-[var(--chat-surface-hover)] sm:h-9 sm:w-9"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => setSet({ ...set, cards: [...set.cards, { front: '', back: '' }] })}
      >
        <Plus className="me-1 h-3.5 w-3.5" aria-hidden="true" />
        Add card
      </Button>
      <EditorActions onCancel={onCancel} onSave={() => onSave(set)} saveDisabled={!complete} />
    </section>
  );
}
