import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { StudyDocument } from './StudyDocument';
import { buildQuizFollowUp } from './QuizView';
import {
  gradeShortAnswer,
  parseFlashcards,
  parseQuiz,
  studySegments,
  type ShortAnswerQuestion,
} from './study-set';
import { flashcardsPrintHtml, printHtml, quizPrintHtml } from './study-print';

const QUIZ = {
  title: 'Cells',
  questions: [
    {
      type: 'multiple_choice',
      question: 'Which organelle makes ATP?',
      options: ['Nucleus', 'Mitochondrion', 'Ribosome'],
      answer: 1,
      explanation: 'Mitochondria run cellular respiration.',
      hints: ['It is often called the powerhouse.', 'Its name starts with M.'],
    },
    {
      type: 'short_answer',
      question: 'What carries genetic information?',
      answer: 'DNA',
      accept: ['deoxyribonucleic acid'],
      explanation: 'DNA stores the genetic code.',
    },
  ],
};

const CARDS = {
  title: 'Terms',
  cards: [
    { front: 'Osmosis', back: 'Water moving across a membrane' },
    { front: 'Diffusion', back: 'Particles spreading out' },
  ],
};

const DOC = `# Biology review\n\nWork through these.\n\n~~~quiz\n${JSON.stringify(QUIZ)}\n~~~\n\n~~~flashcards\n${JSON.stringify(CARDS)}\n~~~\n`;

describe('study sets', () => {
  it('reads quiz and flashcard blocks out of a document', () => {
    expect(studySegments(DOC).map((segment) => segment.kind)).toEqual([
      'markdown',
      'quiz',
      'flashcards',
    ]);
    expect(parseQuiz(JSON.stringify(QUIZ))!.questions.map((q) => q.kind)).toEqual([
      'multiple_choice',
      'short_answer',
    ]);
    expect(parseFlashcards('[{"term":"A","definition":"B"}]')!.cards).toEqual([
      { front: 'A', back: 'B' },
    ]);
    expect(parseQuiz('{"questions":[{"question":"x","options":["a","b"],"answer":7}]}')).toBeNull();
  });

  it('grades short answers forgivingly but not loosely', () => {
    const question = parseQuiz(JSON.stringify(QUIZ))!.questions[1] as ShortAnswerQuestion;
    expect(gradeShortAnswer(question, '  dna. ')).toBe(true);
    expect(gradeShortAnswer(question, 'Deoxyribonucleic acid')).toBe(true);
    expect(gradeShortAnswer(question, 'RNA')).toBe(false);
    expect(gradeShortAnswer(question, '')).toBe(false);
  });

  it('runs the quiz one question at a time with hints, feedback and explanations', () => {
    const onAsk = vi.fn(() => true);
    render(<StudyDocument content={DOC} editable onSave={vi.fn()} onAsk={onAsk} />);
    const quiz = screen.getByTestId('quiz-view');
    expect(within(quiz).getByText('Question 1 of 2')).toBeInTheDocument();

    fireEvent.click(within(quiz).getByTestId('quiz-hint'));
    expect(within(quiz).getByText('It is often called the powerhouse.')).toBeInTheDocument();
    expect(within(quiz).queryByText('Its name starts with M.')).not.toBeInTheDocument();

    fireEvent.click(within(quiz).getByLabelText('Nucleus'));
    fireEvent.click(within(quiz).getByTestId('quiz-check'));
    const feedback = within(quiz).getByTestId('quiz-feedback');
    expect(feedback).toHaveTextContent('Not quite. The answer is Mitochondrion.');
    expect(feedback).toHaveTextContent('Mitochondria run cellular respiration.');

    fireEvent.click(within(quiz).getByTestId('quiz-next'));
    fireEvent.change(within(quiz).getByPlaceholderText('Type your answer'), {
      target: { value: 'dna' },
    });
    fireEvent.click(within(quiz).getByTestId('quiz-check'));
    expect(within(quiz).getByTestId('quiz-feedback')).toHaveTextContent('Correct.');
    fireEvent.click(within(quiz).getByTestId('quiz-finish'));

    const results = screen.getByTestId('quiz-results');
    expect(results).toHaveTextContent('You scored 1 of 2');
    fireEvent.click(within(results).getByTestId('quiz-follow-up'));
    const prompt = (onAsk.mock.calls[0] as unknown as [string])[0];
    expect(prompt).toContain('scored 1 of 2');
    expect(prompt).toContain('Which organelle makes ATP? (I answered: Nucleus)');
    expect(prompt).toContain('source material');
  });

  it('flips flashcards and narrows review to the cards still being learned', () => {
    render(<StudyDocument content={DOC} editable onSave={vi.fn()} />);
    const deck = screen.getByTestId('flashcards-view');
    const card = within(deck).getByTestId('flashcard');
    expect(card).toHaveTextContent('Osmosis');
    fireEvent.click(card);
    expect(card).toHaveTextContent('Water moving across a membrane');
    fireEvent.click(within(deck).getByTestId('flashcard-known'));
    fireEvent.click(within(deck).getByTestId('flashcard'));
    fireEvent.click(within(deck).getByTestId('flashcard-again'));
    fireEvent.click(within(deck).getByTestId('flashcards-review-learning'));
    expect(within(deck).getByText(/Card 1 of 1/)).toBeInTheDocument();
    expect(within(deck).getByTestId('flashcard')).toHaveTextContent('Diffusion');
  });

  it('edits a quiz and saves it back into the document', () => {
    const onSave = vi.fn();
    render(<StudyDocument content={DOC} editable onSave={onSave} />);
    fireEvent.click(screen.getAllByTestId('study-edit')[0]!);
    const editor = screen.getByTestId('quiz-editor');
    fireEvent.change(within(editor).getAllByLabelText('Question')[0]!, {
      target: { value: 'Which organelle produces ATP?' },
    });
    fireEvent.click(within(editor).getByLabelText('Option 3 is correct'));
    fireEvent.click(within(editor).getByTestId('study-editor-save'));
    const saved = onSave.mock.calls[0]![0] as string;
    const quiz = parseQuiz((studySegments(saved)[1] as { source: string }).source)!;
    expect(quiz.questions[0]).toMatchObject({
      question: 'Which organelle produces ATP?',
      answer: 2,
    });
    expect(studySegments(saved)[2]!.kind).toBe('flashcards');
  });

  it('edits flashcards, adding a card', () => {
    const onSave = vi.fn();
    render(<StudyDocument content={DOC} editable onSave={onSave} />);
    fireEvent.click(screen.getAllByTestId('study-edit')[1]!);
    const editor = screen.getByTestId('flashcards-editor');
    fireEvent.click(within(editor).getByRole('button', { name: 'Add card' }));
    fireEvent.change(within(editor).getByLabelText('Card 3 front'), {
      target: { value: 'Mitosis' },
    });
    fireEvent.change(within(editor).getByLabelText('Card 3 back'), {
      target: { value: 'Cell division' },
    });
    fireEvent.click(within(editor).getByTestId('study-editor-save'));
    const saved = onSave.mock.calls[0]![0] as string;
    expect(
      parseFlashcards((studySegments(saved)[2] as { source: string }).source)!.cards,
    ).toHaveLength(3);
  });

  it('hides editing on a read-only version', () => {
    render(<StudyDocument content={DOC} editable={false} onSave={vi.fn()} />);
    expect(screen.queryByTestId('study-edit')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('study-print')).toHaveLength(2);
  });

  it('prints a quiz with an answer key and cards as a two-column sheet', () => {
    const quizHtml = quizPrintHtml(parseQuiz(JSON.stringify(QUIZ))!);
    expect(quizHtml).toContain('Answer key');
    expect(quizHtml).toContain('B. Mitochondrion');
    const cardsHtml = flashcardsPrintHtml(parseFlashcards(JSON.stringify(CARDS))!);
    expect(cardsHtml).toContain('<td>Osmosis</td>');
  });

  it('prints from a frame that may open the print dialog but never run script', () => {
    printHtml(quizPrintHtml(parseQuiz(JSON.stringify(QUIZ))!));
    const frame = document.body.querySelector('iframe');
    expect(frame).not.toBeNull();
    const sandbox = frame!.getAttribute('sandbox')!.split(' ');
    expect(sandbox).toEqual(expect.arrayContaining(['allow-same-origin', 'allow-modals']));
    expect(sandbox).not.toContain('allow-scripts');
    frame!.remove();
  });

  it('asks for encouragement onward when nothing was missed', () => {
    const quiz = parseQuiz(JSON.stringify(QUIZ))!;
    const prompt = buildQuizFollowUp(quiz, [
      { choice: 1, typed: '', submitted: true, correct: true, hints: 0 },
      { choice: null, typed: 'DNA', submitted: true, correct: true, hints: 0 },
    ]);
    expect(prompt).toContain('What should I study next');
  });
});
