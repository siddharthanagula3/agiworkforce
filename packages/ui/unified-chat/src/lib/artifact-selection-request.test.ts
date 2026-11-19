import { describe, expect, it } from 'vitest';

import {
  CONTEXT_CHARS,
  MAX_SELECTION_CHARS,
  bestOccurrence,
  buildArtifactSelectionRequest,
  captureSelectionContext,
  lettersOnly,
  selectionActionsFor,
  windowAround,
} from './artifact-selection-request';
import { MAX_INLINE_DOCUMENT_CHARS } from './artifact-edit-request';

describe('captureSelectionContext', () => {
  it('returns the trimmed selection with up to CONTEXT_CHARS of source on each side', () => {
    const source = `${'a'.repeat(500)}TARGET${'b'.repeat(500)}`;
    expect(captureSelectionContext(source, '  TARGET  ')).toEqual({
      text: 'TARGET',
      before: 'a'.repeat(CONTEXT_CHARS),
      after: 'b'.repeat(CONTEXT_CHARS),
    });
  });

  it('caps the selection and leaves context empty when the text is not in the source', () => {
    const long = 'x'.repeat(MAX_SELECTION_CHARS + 50);
    expect(captureSelectionContext('nothing here', long)).toEqual({
      text: 'x'.repeat(MAX_SELECTION_CHARS),
      before: '',
      after: '',
    });
  });

  it('picks the occurrence whose rendered surroundings match', () => {
    const source = 'Intro: the plan. Later: the plan.';
    expect(captureSelectionContext(source, 'the plan', { before: 'Later: ', after: '.' })).toEqual({
      text: 'the plan',
      before: 'Intro: the plan. Later: ',
      after: '.',
    });
    expect(captureSelectionContext(source, 'the plan').before).toBe('Intro: ');
  });
});

describe('text occurrence rules', () => {
  it('ignores punctuation and spacing when comparing', () => {
    expect(lettersOnly('a, b. c!')).toBe('abc');
  });

  it('returns null on a tie and the index on a clear winner', () => {
    expect(
      bestOccurrence(
        [
          { before: 'x', after: 'y' },
          { before: 'x', after: 'y' },
        ],
        { before: 'x', after: 'y' },
      ),
    ).toBeNull();
    expect(
      bestOccurrence(
        [
          { before: 'one', after: '' },
          { before: 'two', after: '' },
        ],
        { before: 'two', after: '' },
      ),
    ).toBe(1);
    expect(windowAround('abcdef', 2, 4, 1)).toEqual({ before: 'b', after: 'e' });
  });
});

describe('buildArtifactSelectionRequest', () => {
  it('names the artifact, the passage, its surroundings and the change', () => {
    const request = buildArtifactSelectionRequest({
      title: 'Plan',
      selection: { text: 'the ```plan```', before: ' Intro: ', after: '. ' },
      instruction: 'Make it shorter',
      scope: 'slide 2',
    });
    expect(request).toContain(
      'Edit the artifact "Plan". Change only the selected passage in slide 2 as described and keep everything else exactly as it is, including the title.',
    );
    expect(request).toContain('Selected passage:\n```\nthe ``plan``\n```');
    expect(request).toContain('It sits between:\n```\nIntro: [selection].\n```');
    expect(request).toContain('Requested change: ');
    expect(request).not.toContain('Start from this current version');
  });

  it('carries the edited version only while it fits inline', () => {
    const base = {
      title: 'Plan',
      selection: { text: 'x', before: '', after: '' },
      instruction: 'Fix it',
      language: 'md',
    };
    expect(buildArtifactSelectionRequest({ ...base, currentContent: 'current' })).toContain(
      'Start from this current version:\n```md\ncurrent\n```',
    );
    expect(
      buildArtifactSelectionRequest({
        ...base,
        currentContent: 'y'.repeat(MAX_INLINE_DOCUMENT_CHARS + 1),
      }),
    ).not.toContain('Start from this current version');
  });
});

describe('selectionActionsFor', () => {
  it('lists edit, tone and audience actions, then one translation per language given', () => {
    const actions = selectionActionsFor([{ code: 'es', name: 'Spanish' }]);
    expect(actions.slice(0, 3).map((action) => action.id)).toEqual([
      'rewrite',
      'shorten',
      'expand',
    ]);
    expect(actions.filter((action) => action.group === 'Change tone')).toHaveLength(5);
    expect(actions.filter((action) => action.group === 'Adjust for')).toHaveLength(5);
    expect(actions[actions.length - 1]).toEqual({
      id: 'translate-es',
      label: 'Spanish',
      group: 'Translate to',
      instruction: 'Translate it into Spanish.',
    });
  });
});
