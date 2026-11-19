import { describe, expect, it } from 'vitest';
import {
  buildQuizFollowUp,
  hasStudyBlocks,
  parseFlashcards,
  parseQuiz,
  replaceStudyBlock,
  shortAnswerRecheckPrompt,
  studySegments,
  type ShortAnswerQuestion,
} from './study-set';

const QUIZ = parseQuiz(
  JSON.stringify({
    title: 'Cells',
    questions: [
      {
        type: 'multiple_choice',
        question: 'Powerhouse?',
        options: ['Nucleus', 'Mitochondria'],
        answer: 1,
      },
      { type: 'short_answer', question: 'Genetic material?', answer: 'DNA' },
    ],
  }),
)!;

describe('study set follow-ups', () => {
  it('lists each missed question with the answer given', () => {
    const prompt = buildQuizFollowUp(QUIZ, [
      { choice: 0, typed: '', submitted: true, correct: false },
      { choice: null, typed: 'RNA', submitted: true, correct: false },
    ]);
    expect(prompt.split('\n')).toEqual([
      'I finished the quiz "Cells" and scored 0 of 2.',
      'Explain the questions I got wrong using the source material we have been working from, and point to where in the sources each answer comes from:',
      '',
      '1. Powerhouse? (I answered: Nucleus)',
      '2. Genetic material? (I answered: RNA)',
    ]);
  });

  it('asks what to study next when nothing was missed and skips unanswered questions', () => {
    const prompt = buildQuizFollowUp(QUIZ, [
      { choice: 1, typed: '', submitted: true, correct: true },
    ]);
    expect(prompt).toBe(
      'I finished the quiz "Cells" and scored 1 of 2.\nI got everything right. What should I study next to go further, based on the same material?',
    );
  });

  it('builds the short answer recheck question from the expected answer', () => {
    const question = QUIZ.questions[1] as ShortAnswerQuestion;
    expect(shortAnswerRecheckPrompt(question, 'deoxyribonucleic acid')).toBe(
      'For the question "Genetic material?" I answered "deoxyribonucleic acid". The expected answer is "DNA". Is my answer also correct, or where did it go wrong?',
    );
  });
});

describe('a position counter the model wrote into a study set title', () => {
  function quizTitled(title: string): string | undefined {
    return parseQuiz(
      JSON.stringify({
        title,
        questions: [{ question: 'Powerhouse?', options: ['Nucleus', 'Mitochondria'], answer: 1 }],
      }),
    )?.title;
  }

  function cardsTitled(title: string): string | undefined {
    return parseFlashcards(
      JSON.stringify({ title, cards: [{ front: 'Osmosis', back: 'Water crossing a membrane' }] }),
    )?.title;
  }

  it.each([
    ['Photosynthesis: Question 1 of 2', 'Photosynthesis'],
    // em-dash-allow: the separator a model writes before its counter
    ['Photosynthesis — Question 1 of 2', 'Photosynthesis'],
    ['Photosynthesis (Question 1 of 2)', 'Photosynthesis'],
    ['Question 1 of 2: Photosynthesis', 'Photosynthesis'],
    ['Photosynthesis: Question 1 of 2.', 'Photosynthesis'],
    ['Question #1 of 2: Photosynthesis', 'Photosynthesis'],
    // em-dash-allow: the separator a model writes before its counter
    ['Photosynthesis — Question 1 out of 2', 'Photosynthesis'],
    ['Question 1 of 2: Photosynthesis (Question 1 of 2)', 'Photosynthesis'],
    ['Question 1 of 2', ''],
    ['Cells and tissues', 'Cells and tissues'],
    ['FAQ 1 of 3', 'FAQ 1 of 3'],
    ['Earnings: Q3/2024', 'Earnings: Q3/2024'],
    ['Budget review Q2 of 2026', 'Budget review Q2 of 2026'],
    ['Q1 of 2025: revenue recap', 'Q1 of 2025: revenue recap'],
    ['Photosynthesis: Q1 of 2', 'Photosynthesis'],
    ['Question 1 of 20th century physics', 'Question 1 of 20th century physics'],
    ['Finance recap Q4/24', 'Finance recap Q4/24'],
    ['Q3/4 planning review', 'Q3/4 planning review'],
    ['FY25 Q3/4', 'FY25 Q3/4'],
  ])('reads the quiz title %s as %s', (title, kept) => {
    expect(quizTitled(title)).toBe(kept);
  });

  it.each([
    ['Terms: Card 1 of 3', 'Terms'],
    // em-dash-allow: the separator a model writes before its counter
    ['Terms — Card 1 of 3.', 'Terms'],
    ['Flashcard 2 of 5: Terms', 'Terms'],
    ['Key terms', 'Key terms'],
    ['Scorecard 1 of 2', 'Scorecard 1 of 2'],
    ['Terms: Question 1 of 2', 'Terms: Question 1 of 2'],
    ['Card 1 of 20th century terms', 'Card 1 of 20th century terms'],
  ])('reads the flashcards title %s as %s', (title, kept) => {
    expect(cardsTitled(title)).toBe(kept);
  });
});

describe('study blocks in a document', () => {
  const quizJson = JSON.stringify(
    { questions: [{ question: 'Powerhouse?', options: ['Nucleus', 'Mitochondria'], answer: 1 }] },
    null,
    2,
  );
  const cardsJson = JSON.stringify(
    { cards: [{ front: 'Osmosis', back: 'Water crossing a membrane' }] },
    null,
    2,
  );

  it('closes a block on a longer fence of the same kind and reads indented blocks', () => {
    const document = [
      'Intro.',
      '~~~ Quiz',
      quizJson,
      '~~~~',
      'Between.',
      '  ```flashcards',
      cardsJson,
      '  ```',
      'End.',
    ].join('\n');
    const segments = studySegments(document);
    expect(segments.map((segment) => segment.kind)).toEqual([
      'markdown',
      'quiz',
      'markdown',
      'flashcards',
      'markdown',
    ]);
    const [, quiz, , cards] = segments;
    expect(quiz?.kind === 'quiz' && parseQuiz(quiz.source)?.questions).toHaveLength(1);
    expect(cards?.kind === 'flashcards' && parseFlashcards(cards.source)?.cards).toHaveLength(1);
  });

  it('does not close a tilde block on a backtick fence or a shorter fence', () => {
    const document = ['~~~~quiz', '```', '~~~', quizJson, '~~~~'].join('\n');
    const [quiz] = studySegments(document);
    expect(quiz).toMatchObject({
      kind: 'quiz',
      source: ['```', '~~~', quizJson].join('\n'),
      start: 0,
      end: document.split('\n').length - 1,
    });
    expect(hasStudyBlocks('```json\n{}\n```')).toBe(false);
  });

  it('rewrites a block closed by a longer fence in place', () => {
    const document = ['~~~quiz', quizJson, '~~~~', 'After.'].join('\n');
    const next = replaceStudyBlock(document, 0, 'quiz', '{}');
    expect(next).toBe(['~~~quiz', '{}', '~~~', 'After.'].join('\n'));
  });
});
