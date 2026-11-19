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

import { render, screen } from '@testing-library/react-native';
import {
  ARTIFACT_TITLE_MAX_CHARS,
  normalizeArtifactTitle,
} from '@agiworkforce/unified-chat/answer-document';
import { deriveArtifacts } from '@agiworkforce/artifacts';
import { deriveAndMapToMobileArtifacts } from '@/src/features/artifacts/store';
import { offersMessageArtifact } from '@/stores/chat/derivedMessageArtifact';
import { renderMarkdownContent } from '../../MessageContentRenderer';
import { artifactViewerKind } from '../viewerKind';
import {
  studyArtifactContent,
  studyArtifactTitle,
  studySummary,
  studyTitle,
} from '../study/studyContent';

const DASH = String.fromCharCode(0x2014);

const STORED_QUIZ_ANSWER =
  '1. Try the first multiple-choice question.\n2. Review your answer, then try the second.\n\n**Step 1 ' +
  DASH +
  ' Question 1 of 2**\n\n*Photosynthesis* is the process plants use to make their own food. *Energy* is what powers this process.\n\n```markdown\n<!-- @artifact -->\n~~~quiz\n{\n  "title": "Photosynthesis: Question 1 of 2",\n  "questions": [\n    {\n      "type": "multiple_choice",\n      "question": "What supplies the energy plants use for photosynthesis?",\n      "options": ["Sunlight", "Sound", "Wind"],\n      "answer": 0,\n      "explanation": "Plants capture energy from sunlight to help make their food.",\n      "hints": ["Think about why a plant might struggle in a completely dark room."]\n    }\n  ]\n}\n~~~\n```\n';

const STORED_FLASHCARDS_ANSWER =
  '```markdown\n<!-- @artifact -->\n~~~flashcards\n{\n  "title": "Photosynthesis: 3 Key Terms",\n  "cards": [\n    {\n      "front": "What is photosynthesis?",\n      "back": "The process plants use to turn light energy, water, and carbon dioxide' +
  DASH +
  'a gas in the air' +
  DASH +
  'into sugar for food."\n    },\n    {\n      "front": "What is chlorophyll?",\n      "back": "The green substance in plants that absorbs light energy for photosynthesis."\n    },\n    {\n      "front": "What is oxygen?",\n      "back": "A gas that plants release during photosynthesis and that our bodies need to breathe."\n    }\n  ]\n}\n~~~\n```\n';

const QUIZ_JSON = JSON.stringify(
  {
    title: 'Cell parts',
    questions: [
      {
        type: 'multiple_choice',
        question: 'Which organelle makes ATP?',
        options: ['Nucleus', 'Mitochondrion'],
        answer: 1,
        explanation: 'Mitochondria run cellular respiration.',
      },
    ],
  },
  null,
  2,
);

const CARDS_JSON = JSON.stringify(
  { title: 'Cell terms', cards: [{ front: 'Osmosis', back: 'Water crossing a membrane' }] },
  null,
  2,
);

const QUIZ_QUESTION = 'Which organelle makes ATP?';
const QUIZ_SECRET = 'Mitochondria run cellular respiration.';
const CARD_FRONT = 'Osmosis';
const CARD_BACK = 'Water crossing a membrane';

const FORMS: Record<string, string> = {
  'an outer markdown fence with the marker and tilde blocks': [
    'Here is your practice.',
    '',
    '```markdown',
    '<!-- @artifact -->',
    '~~~quiz',
    QUIZ_JSON,
    '~~~',
    '',
    'Then the terms.',
    '',
    '~~~flashcards',
    CARDS_JSON,
    '~~~',
    '```',
  ].join('\n'),
  'an outer markdown fence without the marker': [
    '```md',
    '~~~quiz',
    QUIZ_JSON,
    '~~~',
    '~~~flashcards',
    CARDS_JSON,
    '~~~',
    '```',
  ].join('\n'),
  'an outer fence with no language that starts with the marker': [
    '```',
    '<!-- @artifact -->',
    '~~~quiz',
    QUIZ_JSON,
    '~~~',
    '~~~flashcards',
    CARDS_JSON,
    '~~~',
    '```',
  ].join('\n'),
  'a longer outer fence holding backtick blocks': [
    '````markdown',
    '<!-- @artifact -->',
    '# Review',
    '',
    '```quiz',
    QUIZ_JSON,
    '```',
    '',
    '```flashcards',
    CARDS_JSON,
    '```',
    '````',
  ].join('\n'),
  'unwrapped blocks with the marker among prose': [
    'Here is your practice.',
    '',
    '<!-- @artifact -->',
    '~~~quiz',
    QUIZ_JSON,
    '~~~',
    '',
    'Then the terms.',
    '',
    '```flashcards',
    CARDS_JSON,
    '```',
    '',
    'Good luck.',
  ].join('\n'),
  'inner blocks closed by a longer fence and opened with a capital name': [
    '```markdown',
    '<!-- @artifact -->',
    '~~~ Quiz',
    QUIZ_JSON,
    '~~~~',
    '',
    '  ~~~flashcards',
    CARDS_JSON,
    '  ~~~',
    '```',
  ].join('\n'),
};

const THREE_BACKTICK_WRAPPED_FORM = [
  '```markdown',
  '<!-- @artifact -->',
  '```quiz',
  QUIZ_JSON,
  '```',
  '',
  '```flashcards',
  CARDS_JSON,
  '```',
  '```',
].join('\n');

function renderAnswer(content: string) {
  return render(<>{renderMarkdownContent(content)}</>);
}

function derived(content: string) {
  return deriveAndMapToMobileArtifacts(
    content,
    'conversation-1',
    'message-1',
    '2026-11-15T12:00:00.000Z',
    'Practise it',
    { scope: 'local' },
  );
}

describe('the study answer the server stored on the simulator', () => {
  it('shows the quiz inline, never the marker, the fence or the answer', () => {
    const view = renderAnswer(STORED_QUIZ_ANSWER);
    expect(screen.getByTestId('study-document')).toBeTruthy();
    expect(
      screen.getByText('What supplies the energy plants use for photosynthesis?'),
    ).toBeTruthy();
    const tree = JSON.stringify(view.toJSON());
    expect(tree).not.toContain('@artifact');
    expect(tree).not.toContain('~~~quiz');
    expect(tree).not.toContain('"answer"');
    expect(tree).not.toContain('Plants capture energy from sunlight');
    expect(screen.queryByText('markdown')).toBeNull();
  });

  it('shows the flashcards inline with the backs hidden', () => {
    const view = renderAnswer(STORED_FLASHCARDS_ANSWER);
    expect(screen.getByTestId('study-document')).toBeTruthy();
    expect(screen.getByText('What is photosynthesis?')).toBeTruthy();
    const tree = JSON.stringify(view.toJSON());
    expect(tree).not.toContain('~~~flashcards');
    expect(tree).not.toContain('"front"');
  });

  it('gives the card a study title and summary and opens the study view', () => {
    const [quiz] = derived(STORED_QUIZ_ANSWER);
    const [cards] = derived(STORED_FLASHCARDS_ANSWER);
    const quizDocument = studyArtifactContent(quiz!.language, quiz!.content);
    const cardsDocument = studyArtifactContent(cards!.language, cards!.content);
    expect(studyTitle(quizDocument!)).toBe('Photosynthesis');
    expect(studySummary(quizDocument!)).toBe('Quiz, 1 question');
    expect(studyTitle(cardsDocument!)).toBe('Photosynthesis: 3 Key Terms');
    expect(studySummary(cardsDocument!)).toBe('Flashcards, 3 cards');
    expect(studyArtifactTitle(quiz!.language, quiz!.content)).toBe('Photosynthesis');
    expect(studyArtifactTitle(cards!.language, cards!.content)).toBe('Photosynthesis: 3 Key Terms');
    expect(studyArtifactTitle('python', 'print(1)')).toBeNull();
    const longTitle = `Photosynthesis\n${'review '.repeat(60)}`;
    const longQuiz = quiz!.content.replace(
      'Photosynthesis: Question 1 of 2',
      longTitle.replaceAll('\n', '\\n'),
    );
    const boundedTitle = studyArtifactTitle(quiz!.language, longQuiz);
    expect(boundedTitle).toBe(normalizeArtifactTitle(longTitle));
    expect(boundedTitle).not.toContain('\n');
    expect(boundedTitle!.length).toBe(ARTIFACT_TITLE_MAX_CHARS);
    for (const artifact of [quiz!, cards!]) {
      expect(
        artifactViewerKind({
          origin: 'inline',
          title: artifact.title,
          content: artifact.content,
          ...(artifact.language ? { language: artifact.language } : {}),
        }),
      ).toBe('study');
    }
  });
});

describe('a three-backtick markdown fence holding backtick blocks', () => {
  it('renders the quiz and the cards inline without their source or answers', () => {
    const view = renderAnswer(THREE_BACKTICK_WRAPPED_FORM);
    expect(screen.getByText(QUIZ_QUESTION)).toBeTruthy();
    expect(screen.getByText(CARD_FRONT)).toBeTruthy();
    expect(screen.queryByTestId('study-segment-unreadable')).toBeNull();
    expect(screen.queryByTestId('markdown-surface-unfinished')).toBeNull();
    expect(screen.queryAllByLabelText(/code block$/).length).toBe(0);
    const tree = JSON.stringify(view.toJSON());
    expect(tree).not.toContain('@artifact');
    expect(tree).not.toContain(QUIZ_SECRET);
    expect(tree).not.toContain(CARD_BACK);
    expect(tree).not.toMatch(/[~`]{3}/);
  });
});

describe.each(Object.entries(FORMS))(
  'the answer around a study document as %s',
  (_form, content) => {
    it('draws no code block', () => {
      renderAnswer(content);
      expect(screen.queryAllByLabelText(/code block$/)).toEqual([]);
    });
  },
);

describe.each(Object.entries(FORMS))('a study document as %s', (_form, content) => {
  it('renders the quiz and the cards inline without their source or answers', () => {
    const view = renderAnswer(content);
    expect(screen.getAllByTestId('study-document').length).toBeGreaterThan(0);
    expect(screen.getByText(QUIZ_QUESTION)).toBeTruthy();
    expect(screen.getByText(CARD_FRONT)).toBeTruthy();
    expect(screen.queryByTestId('study-segment-unreadable')).toBeNull();
    expect(screen.queryByTestId('markdown-surface-unfinished')).toBeNull();
    const tree = JSON.stringify(view.toJSON());
    expect(tree).not.toContain('@artifact');
    expect(tree).not.toContain('"questions"');
    expect(tree).not.toContain('"cards"');
    expect(tree).not.toContain(QUIZ_SECRET);
    expect(tree).not.toContain(CARD_BACK);
    expect(tree).not.toMatch(/[~`]{3}/);
  });

  it('lists the cards the chat offers and opens each in the study view without an answer', () => {
    const artifacts = derived(content);
    const offered = deriveArtifacts(content, {
      conversationId: 'conversation-1',
      messageId: 'message-1',
      include: (block) => offersMessageArtifact(block, 'local'),
    });
    expect(artifacts.map((artifact) => artifact.id)).toEqual(offered.map((card) => card.id));
    for (const artifact of artifacts) {
      expect(artifact.title).not.toMatch(/[~`]{3}/);
      const document = studyArtifactContent(artifact.language, artifact.content);
      expect(document).not.toBeNull();
      expect(studySummary(document!)).not.toContain('Mitochondri');
      expect(
        artifactViewerKind({
          origin: 'inline',
          title: artifact.title,
          content: artifact.content,
          ...(artifact.language ? { language: artifact.language } : {}),
        }),
      ).toBe('study');
    }
  });
});
