/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('@/services/fileCreation', () => ({
  downloadGeneratedFile: jest.fn(),
  shareFile: jest.fn(),
}));
jest.mock('@/src/features/chat/components/ArtifactAudienceChip', () => ({
  ArtifactAudienceChip: () => null,
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

import { fireEvent, render, screen } from '@testing-library/react-native';
import { InlineArtifactCard } from '@/src/features/chat/components/InlineArtifactCard';
import type { Artifact } from '@/types/chat';

const DECK =
  '<!-- deck -->\n# Launch plan\nWhy now\n\n---\n\n## Steps\nShip it\n\n---\n\n## Thanks';

function artifact(type: Artifact['type'], content: string): Artifact {
  return { id: `deck-${type}`, type, title: 'Launch plan', content, language: 'markdown' };
}

describe('InlineArtifactCard deck summary', () => {
  it('summarises a deck by its slide count instead of its source, stored as code or document', () => {
    for (const type of ['code', 'document'] as const) {
      const onExpand = jest.fn();
      const { unmount } = render(
        <InlineArtifactCard artifact={artifact(type, DECK)} onExpand={onExpand} />,
      );
      expect(screen.getByText('Presentation, 3 slides')).toBeTruthy();
      expect(screen.queryByText(/<!-- deck -->/)).toBeNull();
      fireEvent.press(screen.getByLabelText(/Launch plan/));
      expect(onExpand).toHaveBeenCalledWith(artifact(type, DECK));
      unmount();
    }
  });

  it('keeps the text preview for a Markdown document that is not a deck', () => {
    render(
      <InlineArtifactCard
        artifact={artifact('document', '# Notes\n\nPlain notes')}
        onExpand={jest.fn()}
      />,
    );
    expect(screen.getByText('# Notes\n\nPlain notes')).toBeTruthy();
  });
});

const QUIZ_DOCUMENT = [
  '<!-- @artifact -->',
  '# Cells practice',
  '',
  '~~~quiz',
  JSON.stringify({
    title: 'Cells',
    questions: [
      {
        type: 'multiple_choice',
        question: 'Which organelle makes ATP?',
        options: ['Nucleus', 'Mitochondrion'],
        answer: 1,
        explanation: 'Mitochondria run cellular respiration.',
      },
    ],
  }),
  '~~~',
  '',
  '~~~flashcards',
  JSON.stringify({ cards: [{ front: 'ATP', back: 'Energy currency' }] }),
  '~~~',
].join('\n');

describe('InlineArtifactCard study summary', () => {
  it('summarises a quiz and flashcards without showing their source or an answer', () => {
    render(
      <InlineArtifactCard
        artifact={{
          id: 'study-1',
          type: 'document',
          title: 'Cells practice',
          content: QUIZ_DOCUMENT,
          language: 'markdown',
        }}
        onExpand={jest.fn()}
      />,
    );
    expect(screen.getByText('Quiz, 1 question · Flashcards, 1 card')).toBeTruthy();
    expect(screen.queryByText(/~~~quiz/)).toBeNull();
    expect(screen.queryByText(/Mitochondrion/)).toBeNull();
    expect(screen.queryByText(/Energy currency/)).toBeNull();
  });
});
