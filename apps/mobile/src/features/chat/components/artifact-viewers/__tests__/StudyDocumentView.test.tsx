/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) =>
        name === '__esModule' ? true : (props: Record<string, unknown>) => <RN.View {...props} />,
    },
  );
});

import {
  buildQuizFollowUp,
  parseQuiz,
  shortAnswerRecheckPrompt,
  type ShortAnswerQuestion,
} from '@agiworkforce/unified-chat/study-set';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { StudyDocumentView } from '../study/StudyDocumentView';
import {
  studyArtifactContent,
  studyFenceContent,
  studySummary,
  studyTitle,
} from '../study/studyContent';

const QUIZ_JSON = JSON.stringify({
  title: 'Cells',
  questions: [
    {
      type: 'multiple_choice',
      question: 'Which organelle makes ATP?',
      options: ['Nucleus', 'Mitochondrion', 'Ribosome'],
      answer: 1,
      explanation: 'Mitochondria run cellular respiration.',
      hints: ['It is often called the powerhouse.', 'It has its own DNA.'],
    },
    {
      type: 'short_answer',
      question: 'What molecule carries genetic code?',
      answer: 'DNA',
      accept: ['deoxyribonucleic acid'],
      explanation: 'DNA stores the instructions.',
    },
  ],
});

const CARDS_JSON = JSON.stringify({
  title: 'Terms',
  cards: [
    { front: 'Osmosis', back: 'Water moving across a membrane' },
    { front: 'Diffusion', back: 'Particles spreading out' },
  ],
});

const QUIZ_DOCUMENT = `# Practice\n\nTry these.\n\n~~~quiz\n${QUIZ_JSON}\n~~~\n\nGood luck.`;
const CARDS_DOCUMENT = `~~~flashcards\n${CARDS_JSON}\n~~~`;

const renderMarkdown = (text: string) => <Text testID="markdown-segment">{text}</Text>;

function allText(): string {
  return screen
    .UNSAFE_getAllByType(Text)
    .map((node) => {
      const children = (node.props as { children?: unknown }).children;
      return Array.isArray(children) ? children.join('') : String(children ?? '');
    })
    .join('\n');
}

describe('studyFenceContent', () => {
  it('reads a Markdown document fence marked as an artifact and drops the marker', () => {
    const body = `<!-- @artifact -->\n${QUIZ_DOCUMENT}`;
    expect(studyFenceContent('markdown', body)).toBe(QUIZ_DOCUMENT);
    expect(studyFenceContent('md', QUIZ_DOCUMENT)).toBe(QUIZ_DOCUMENT);
  });

  it('wraps a bare quiz or flashcards fence as a study document', () => {
    expect(studyFenceContent('quiz', `${QUIZ_JSON}\n`)).toBe(`~~~quiz\n${QUIZ_JSON}\n~~~`);
    expect(studyFenceContent('Flashcards', CARDS_JSON)).toBe(`~~~flashcards\n${CARDS_JSON}\n~~~`);
  });

  it('leaves every other fence to its usual rendering', () => {
    expect(studyFenceContent('markdown', '# Notes\n\nNo practice here.')).toBeNull();
    expect(studyFenceContent('json', QUIZ_JSON)).toBeNull();
    expect(studyFenceContent('', QUIZ_DOCUMENT)).toBeNull();
  });

  it('recognises a study artifact and summarises it without an answer', () => {
    expect(studyArtifactContent('markdown', `<!-- @artifact -->\n${QUIZ_DOCUMENT}`)).toBe(
      QUIZ_DOCUMENT,
    );
    expect(studyArtifactContent(undefined, CARDS_DOCUMENT)).toBe(CARDS_DOCUMENT);
    expect(studyArtifactContent('python', QUIZ_DOCUMENT)).toBeNull();
    expect(studySummary(`${QUIZ_DOCUMENT}\n\n${CARDS_DOCUMENT}`)).toBe(
      'Quiz, 2 questions · Flashcards, 2 cards',
    );
    expect(studySummary(QUIZ_DOCUMENT)).not.toContain('Mitochondrion');
    expect(studyTitle(QUIZ_DOCUMENT)).toBe('Cells');
  });
});

describe('StudyDocumentView quiz', () => {
  it('renders prose through the caller and never shows the source or the answer first', () => {
    render(<StudyDocumentView content={QUIZ_DOCUMENT} renderMarkdown={renderMarkdown} />);
    const prose = screen.getAllByTestId('markdown-segment').map((node) => node.props.children);
    expect(prose).toEqual(['# Practice\n\nTry these.', 'Good luck.']);
    expect(screen.getByText('Which organelle makes ATP?')).toBeTruthy();
    expect(screen.getByText('Question 1 of 2')).toBeTruthy();
    const text = allText();
    expect(text).not.toContain('"answer"');
    expect(text).not.toContain('Mitochondria run cellular respiration.');
    expect(screen.queryByLabelText(/correct answer/)).toBeNull();
    expect(screen.queryByTestId('quiz-feedback')).toBeNull();
  });

  it('checks a choice only after one is made, then shows the right answer and the explanation', () => {
    render(<StudyDocumentView content={QUIZ_DOCUMENT} renderMarkdown={renderMarkdown} />);
    expect(screen.getByTestId('quiz-check').props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(screen.getByTestId('quiz-option-0'));
    expect(screen.getByTestId('quiz-option-0').props.accessibilityState).toEqual({
      checked: true,
      disabled: false,
    });
    fireEvent.press(screen.getByTestId('quiz-check'));
    expect(screen.getByText('Not quite. The answer is Mitochondrion.')).toBeTruthy();
    expect(screen.getByText('Mitochondria run cellular respiration.')).toBeTruthy();
    expect(screen.getByLabelText('Mitochondrion, correct answer')).toBeTruthy();
    expect(screen.getByLabelText('Nucleus, your answer')).toBeTruthy();
    expect(screen.getByText('0 correct so far')).toBeTruthy();
    fireEvent.press(screen.getByTestId('quiz-option-1'));
    expect(screen.getByLabelText('Nucleus, your answer')).toBeTruthy();
  });

  it('reveals hints one at a time before the answer is checked', () => {
    render(<StudyDocumentView content={QUIZ_DOCUMENT} renderMarkdown={renderMarkdown} />);
    expect(screen.getByText('Show a hint (0/2)')).toBeTruthy();
    expect(screen.queryByText('It is often called the powerhouse.')).toBeNull();
    fireEvent.press(screen.getByTestId('quiz-hint'));
    expect(screen.getByText('It is often called the powerhouse.')).toBeTruthy();
    expect(screen.getByText('Show another hint (1/2)')).toBeTruthy();
    fireEvent.press(screen.getByTestId('quiz-hint'));
    expect(screen.getByText('It has its own DNA.')).toBeTruthy();
    expect(screen.queryByTestId('quiz-hint')).toBeNull();
  });

  it('grades a typed answer, scores the quiz and starts again on Retake', () => {
    const onAsk = jest.fn();
    render(
      <StudyDocumentView content={QUIZ_DOCUMENT} renderMarkdown={renderMarkdown} onAsk={onAsk} />,
    );
    fireEvent.press(screen.getByTestId('quiz-option-1'));
    fireEvent.press(screen.getByTestId('quiz-check'));
    expect(screen.getByText('Correct.')).toBeTruthy();
    expect(screen.getByText('1 correct so far')).toBeTruthy();
    fireEvent.press(screen.getByTestId('quiz-next'));
    expect(screen.getByText('Question 2 of 2')).toBeTruthy();
    expect(screen.queryByText('Correct.')).toBeNull();
    fireEvent.changeText(screen.getByTestId('quiz-answer-input'), 'Deoxyribonucleic acid');
    fireEvent(screen.getByTestId('quiz-answer-input'), 'submitEditing');
    expect(screen.getByText('Correct.')).toBeTruthy();
    expect(screen.getByText('2 correct so far')).toBeTruthy();
    fireEvent.press(screen.getByTestId('quiz-finish'));
    expect(screen.getByText('You scored 2 of 2')).toBeTruthy();
    expect(screen.getByText('Every answer was right.')).toBeTruthy();

    const quiz = parseQuiz(QUIZ_JSON);
    if (!quiz) throw new Error('fixture quiz did not parse');
    const answers = [
      { choice: 1, typed: '', submitted: true, correct: true, hints: 0 },
      { choice: null, typed: 'Deoxyribonucleic acid', submitted: true, correct: true, hints: 0 },
    ];
    fireEvent.press(screen.getByText('What should I study next?'));
    expect(onAsk).toHaveBeenCalledWith(buildQuizFollowUp(quiz, answers));

    fireEvent.press(screen.getByTestId('quiz-retake'));
    expect(screen.getByText('Question 1 of 2')).toBeTruthy();
    expect(screen.getByText('0 correct so far')).toBeTruthy();
    expect(screen.getByTestId('quiz-option-1').props.accessibilityState.checked).toBe(false);
  });

  it('lists a missed question with its answer in the results and offers to ask about it', () => {
    const onAsk = jest.fn();
    render(
      <StudyDocumentView content={QUIZ_DOCUMENT} renderMarkdown={renderMarkdown} onAsk={onAsk} />,
    );
    fireEvent.press(screen.getByTestId('quiz-option-2'));
    fireEvent.press(screen.getByTestId('quiz-check'));
    fireEvent.press(screen.getByTestId('quiz-next'));
    fireEvent.changeText(screen.getByTestId('quiz-answer-input'), 'RNA');
    fireEvent.press(screen.getByTestId('quiz-check'));
    expect(screen.getByText('Not quite. The answer is DNA.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('quiz-ask-wording'));
    const question = parseQuiz(QUIZ_JSON)?.questions[1] as ShortAnswerQuestion;
    expect(onAsk).toHaveBeenLastCalledWith(shortAnswerRecheckPrompt(question, 'RNA'));
    fireEvent.press(screen.getByTestId('quiz-finish'));
    expect(screen.getByText('You scored 0 of 2')).toBeTruthy();
    expect(screen.getByText('Answer: Mitochondrion')).toBeTruthy();
    expect(screen.getByText('Answer: DNA')).toBeTruthy();
    expect(screen.getByText('Explain what I missed')).toBeTruthy();
  });

  it('offers no follow-up controls when the surface cannot send a message', () => {
    render(<StudyDocumentView content={QUIZ_DOCUMENT} renderMarkdown={renderMarkdown} />);
    fireEvent.press(screen.getByTestId('quiz-option-0'));
    fireEvent.press(screen.getByTestId('quiz-check'));
    fireEvent.press(screen.getByTestId('quiz-next'));
    fireEvent.changeText(screen.getByTestId('quiz-answer-input'), 'RNA');
    fireEvent.press(screen.getByTestId('quiz-check'));
    expect(screen.queryByTestId('quiz-ask-wording')).toBeNull();
    fireEvent.press(screen.getByTestId('quiz-finish'));
    expect(screen.queryByTestId('quiz-follow-up')).toBeNull();
  });
});

function quizOf(count: number, title: string): string {
  const questions = Array.from({ length: count }, (_, position) => ({
    type: 'multiple_choice',
    question: `Question text ${position + 1}`,
    options: ['A', 'B'],
    answer: 0,
  }));
  return `~~~quiz\n${JSON.stringify({ title, questions })}\n~~~`;
}

function counters(): string[] {
  return allText()
    .split('\n')
    .filter((line) => /\bof \d+\b/.test(line) && !line.includes('scored'));
}

describe('the quiz position counter', () => {
  it('shows one counter for a one-question quiz whose title carries its own', () => {
    // em-dash-allow: the separator a model writes before its counter
    const title = 'Photosynthesis \u2014 Question 1 of 2';
    render(<StudyDocumentView content={quizOf(1, title)} renderMarkdown={renderMarkdown} />);
    expect(counters()).toEqual(['Question 1 of 1']);
    expect(screen.getByText('Photosynthesis')).toBeTruthy();
  });

  it('shows one counter taken from the questions in a three-question quiz', () => {
    render(
      <StudyDocumentView
        content={quizOf(3, 'Cells: Question 1 of 2')}
        renderMarkdown={renderMarkdown}
      />,
    );
    expect(counters()).toEqual(['Question 1 of 3']);
    fireEvent.press(screen.getByTestId('quiz-option-0'));
    fireEvent.press(screen.getByTestId('quiz-check'));
    fireEvent.press(screen.getByTestId('quiz-next'));
    expect(counters()).toEqual(['Question 2 of 3']);
  });

  it('keeps the title of a set that is named without a counter', () => {
    render(<StudyDocumentView content={quizOf(2, 'Cell parts')} renderMarkdown={renderMarkdown} />);
    expect(screen.getByText('Cell parts')).toBeTruthy();
    expect(counters()).toEqual(['Question 1 of 2']);
  });
});

describe('StudyDocumentView flashcards', () => {
  it('turns a card over, marks it and moves through the set', () => {
    render(<StudyDocumentView content={CARDS_DOCUMENT} renderMarkdown={renderMarkdown} />);
    expect(screen.getByTestId('flashcard-text').props.children).toBe('Osmosis');
    expect(screen.queryByText('Water moving across a membrane')).toBeNull();
    expect(screen.getByText('Card 1 of 2 · 0 known')).toBeTruthy();
    expect(screen.getByTestId('flashcard-previous').props.accessibilityState).toEqual({
      disabled: true,
    });
    expect(screen.queryByTestId('flashcard-known')).toBeNull();

    fireEvent.press(screen.getByTestId('flashcard'));
    expect(screen.getByTestId('flashcard-text').props.children).toBe(
      'Water moving across a membrane',
    );
    expect(screen.getByLabelText('Back: Water moving across a membrane')).toBeTruthy();
    fireEvent.press(screen.getByTestId('flashcard-known'));
    expect(screen.getByText('Card 2 of 2 · 1 known')).toBeTruthy();
    expect(screen.getByTestId('flashcard-text').props.children).toBe('Diffusion');

    fireEvent.press(screen.getByTestId('flashcard-previous'));
    expect(screen.getByTestId('flashcard-text').props.children).toBe('Osmosis');
    fireEvent.press(screen.getByTestId('flashcard-next'));
    fireEvent.press(screen.getByTestId('flashcard'));
    fireEvent.press(screen.getByTestId('flashcard-again'));
    expect(screen.getByText('Card 2 of 2 · 1 known')).toBeTruthy();

    fireEvent.press(screen.getByTestId('flashcards-review-learning'));
    expect(screen.getByText('Card 1 of 1 · 1 known')).toBeTruthy();
    expect(screen.getByTestId('flashcard-text').props.children).toBe('Diffusion');
  });

  it('shuffles from the first card, face up', () => {
    render(<StudyDocumentView content={CARDS_DOCUMENT} renderMarkdown={renderMarkdown} />);
    fireEvent.press(screen.getByTestId('flashcard-next'));
    fireEvent.press(screen.getByTestId('flashcard'));
    fireEvent.press(screen.getByTestId('flashcards-shuffle'));
    expect(screen.getByText('Card 1 of 2 · 0 known')).toBeTruthy();
    expect(screen.getByLabelText(/^Front: /)).toBeTruthy();
  });
});

describe('StudyDocumentView while the answer is written', () => {
  const partial = `Here is a quiz.\n\n~~~quiz\n{"title": "Cells", "questions": [{"type": "multiple_choice", "question": "Which`;

  it('says the quiz is being written and shows none of its source', () => {
    render(<StudyDocumentView content={partial} renderMarkdown={renderMarkdown} streaming />);
    expect(screen.getByText('Writing the quiz')).toBeTruthy();
    expect(allText()).not.toContain('"questions"');
  });

  it('draws the quiz as soon as its source is complete, before the fence closes', () => {
    render(
      <StudyDocumentView
        content={`Here is a quiz.\n\n~~~quiz\n${QUIZ_JSON}`}
        renderMarkdown={renderMarkdown}
        streaming
      />,
    );
    expect(screen.getByTestId('quiz-view')).toBeTruthy();
  });

  it('says a set that cannot be read once the answer is complete', () => {
    render(<StudyDocumentView content={partial} renderMarkdown={renderMarkdown} />);
    expect(screen.getByText('This quiz could not be read.')).toBeTruthy();
    render(
      <StudyDocumentView
        content={'~~~flashcards\n{"cards": []}\n~~~'}
        renderMarkdown={renderMarkdown}
      />,
    );
    expect(screen.getByText('This flashcard set could not be read.')).toBeTruthy();
  });
});
