import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { StudyDocument } from './StudyDocument';
import { buildQuizFollowUp } from './QuizView';
import {
  gradeShortAnswer,
  parseFlashcards,
  MAX_CARDS,
  MAX_QUESTIONS,
  MAX_TEXT,
  parseQuiz,
  serializeQuiz,
  studySegments,
  studySourceIsLossless,
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

describe('study set round trips', () => {
  const FRANCE = {
    title: 'Capitals',
    questions: [
      {
        type: 'multiple_choice',
        question: 'Which is the capital of France?',
        options: ['Rome', 'Paris', 'Berlin'],
        answer: 1,
        explanation: '',
      },
    ],
  };

  function blankFirstOptionAndSave(onSave: (value: string) => void) {
    const content = `~~~quiz\n${JSON.stringify(FRANCE)}\n~~~`;
    render(<StudyDocument content={content} editable onSave={onSave} />);
    fireEvent.click(screen.getByTestId('study-edit'));
    const editor = screen.getByTestId('quiz-editor');
    fireEvent.change(within(editor).getByLabelText('Option 1'), { target: { value: '' } });
    return within(editor).getByTestId('study-editor-save') as HTMLButtonElement;
  }

  it('refuses to save a quiz whose distractor was cleared, so the correct answer cannot shift', () => {
    const onSave = vi.fn();
    const save = blankFirstOptionAndSave(onSave);
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeps the correct answer after removing an earlier option through the editor', () => {
    const onSave = vi.fn();
    const content = `~~~quiz\n${JSON.stringify(FRANCE)}\n~~~`;
    render(<StudyDocument content={content} editable onSave={onSave} />);
    fireEvent.click(screen.getByTestId('study-edit'));
    const editor = screen.getByTestId('quiz-editor');
    fireEvent.click(within(editor).getByLabelText('Remove option 1'));
    fireEvent.click(within(editor).getByTestId('study-editor-save'));
    const saved = onSave.mock.calls[0]![0] as string;
    const question = parseQuiz((studySegments(saved)[0] as { source: string }).source)!
      .questions[0] as { options: string[]; answer: number };
    expect(question.options[question.answer]).toBe('Paris');
  });

  it('reads a numeric answer against the original option positions when an option is blank', () => {
    const quiz = parseQuiz(
      JSON.stringify({
        questions: [
          { question: 'a', options: ['', 'Paris', 'Berlin'], answer: 1 },
          { question: 'b', options: ['', 'Paris', 'Berlin'], answer: 2 },
        ],
      }),
    )!;
    expect(quiz.questions).toMatchObject([
      { options: ['Paris', 'Berlin'], answer: 0 },
      { options: ['Paris', 'Berlin'], answer: 1 },
    ]);
  });

  it('rejects a question whose numeric answer points at a blank option', () => {
    expect(
      parseQuiz(
        JSON.stringify({
          questions: [{ question: 'a', options: ['', 'Paris', 'Berlin'], answer: 0 }],
        }),
      ),
    ).toBeNull();
  });

  it('serializes and re-reads every question of a quiz without changing its answers', () => {
    const quiz = parseQuiz(JSON.stringify(QUIZ))!;
    expect(parseQuiz(serializeQuiz(quiz))).toEqual(quiz);
  });
});

describe('study set editor limits', () => {
  const question = (n: number) => ({
    type: 'short_answer',
    question: `Q${n}`,
    answer: `A${n}`,
    explanation: '',
  });
  const quizSource = (count: number) =>
    JSON.stringify({
      title: 'Big',
      questions: Array.from({ length: count }, (_, i) => question(i)),
    });
  const cardsSource = (count: number) =>
    JSON.stringify({
      title: 'Big',
      cards: Array.from({ length: count }, (_, i) => ({ front: `F${i}`, back: `B${i}` })),
    });

  it('stops adding questions at the limit the reader enforces', () => {
    render(
      <StudyDocument
        content={`~~~quiz\n${quizSource(MAX_QUESTIONS)}\n~~~`}
        editable
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('study-edit'));
    const editor = screen.getByTestId('quiz-editor');
    expect(
      (within(editor).getByRole('button', { name: 'Multiple choice' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (within(editor).getByRole('button', { name: 'Short answer' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((within(editor).getByTestId('study-editor-save') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('stops adding cards at the limit the reader enforces', () => {
    render(
      <StudyDocument
        content={`~~~flashcards\n${cardsSource(MAX_CARDS)}\n~~~`}
        editable
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('study-edit'));
    const editor = screen.getByTestId('flashcards-editor');
    expect(
      (within(editor).getByRole('button', { name: 'Add card' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('bounds every text field to the length the reader keeps', () => {
    render(<StudyDocument content={DOC} editable onSave={vi.fn()} />);
    fireEvent.click(screen.getAllByTestId('study-edit')[0]!);
    const editor = screen.getByTestId('quiz-editor');
    expect(within(editor).getAllByLabelText('Question')[0]!.getAttribute('maxlength')).toBe(
      String(MAX_TEXT),
    );
    expect(within(editor).getByLabelText('Option 1').getAttribute('maxlength')).toBe(
      String(MAX_TEXT),
    );
  });

  it('keeps the exact-boundary set editable and reads it whole', () => {
    expect(studySourceIsLossless('quiz', quizSource(MAX_QUESTIONS))).toBe(true);
    expect(studySourceIsLossless('flashcards', cardsSource(MAX_CARDS))).toBe(true);
    const longest = 'x'.repeat(MAX_TEXT);
    expect(
      studySourceIsLossless(
        'flashcards',
        JSON.stringify({ cards: [{ front: 'f', back: longest }] }),
      ),
    ).toBe(true);
  });

  it.each([
    ['one question over', 'quiz', quizSource(MAX_QUESTIONS + 1)],
    ['one card over', 'flashcards', cardsSource(MAX_CARDS + 1)],
    [
      'a back one character over',
      'flashcards',
      JSON.stringify({ cards: [{ front: 'f', back: 'x'.repeat(MAX_TEXT + 1) }] }),
    ],
    [
      'a dropped malformed question',
      'quiz',
      JSON.stringify({ questions: [question(1), { question: 'no answer' }] }),
    ],
  ] as const)(
    'does not offer to rewrite a source that the reader would shorten: %s',
    (_name, kind, source) => {
      expect(studySourceIsLossless(kind, source)).toBe(false);
      const fence = kind === 'quiz' ? 'quiz' : 'flashcards';
      render(<StudyDocument content={`~~~${fence}\n${source}\n~~~`} editable onSave={vi.fn()} />);
      expect(screen.queryByTestId('study-edit')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(/editing is off/);
    },
  );
});
