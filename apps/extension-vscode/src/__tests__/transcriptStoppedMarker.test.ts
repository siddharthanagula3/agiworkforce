import { describe, expect, it } from 'vitest';
import { normalizeTranscriptMessages } from '../features/sidebar-webview/ChatStateManager';
import { t } from '../l10n';

describe('a stored transcript with a stopped answer', () => {
  it('shows the Stopped label instead of the marker the CLI keeps for the model', () => {
    const [question, partial, empty] = normalizeTranscriptMessages([
      { role: 'user', text: 'Write a long tutorial', index: 0 },
      { role: 'assistant', text: 'There is a subtle detail in that\n\n[stopped]', index: 1 },
      { role: 'assistant', text: '[stopped]', index: 2 },
    ]);

    expect(question?.text).toBe('Write a long tutorial');
    expect(partial?.text).toBe(`There is a subtle detail in that\n\n_${t('webview.stopped')}_`);
    expect(empty?.text).toBe(`_${t('webview.stopped')}_`);
    expect(partial?.text).not.toContain('[stopped]');
  });

  it('leaves a user message that quotes the marker as written', () => {
    const [message] = normalizeTranscriptMessages([
      { role: 'user', text: 'Why does my log end with [stopped]', index: 0 },
    ]);

    expect(message?.text).toBe('Why does my log end with [stopped]');
  });
});

describe('a restored transcript with repeated progress narration', () => {
  it('shows each line of a reply once, and drops the steps that said nothing', () => {
    const restored = normalizeTranscriptMessages([
      { role: 'user', text: 'Fix the failing test', index: 0 },
      { role: 'assistant', text: 'Reading the test file.', index: 1 },
      { role: 'assistant', text: '', index: 2 },
      { role: 'assistant', text: 'Reading the test file.', index: 3 },
      { role: 'assistant', text: 'Reading the test file.\nThe fix is in place.', index: 4 },
      { role: 'user', text: 'Run it again', index: 5 },
      { role: 'assistant', text: 'Reading the test file.', index: 6 },
    ]);

    expect(restored.map((message) => message.text)).toEqual([
      'Fix the failing test',
      'Reading the test file.',
      'The fix is in place.',
      'Run it again',
      'Reading the test file.',
    ]);
  });
});
