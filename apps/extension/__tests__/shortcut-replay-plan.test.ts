/**
 * shortcut-replay-plan.test.ts — regression for the prompt-shortcut replay bug.
 *
 * A shortcut created from the "+ Create shortcut" prompt modal is stored with an
 * empty `actions` array and a `prompt`. The replay handler used to look only at
 * `actions`, so a prompt shortcut dispatched an empty RUN_PAGE_ACTIONS batch that
 * no-oped on the page yet still reported "completed" (fake success). These tests
 * pin the decision (`planShortcutReplay`) that now routes prompt shortcuts through
 * the chat path and refuses shortcuts that have neither actions nor a prompt.
 */
import { describe, expect, it } from 'vitest';
import { planShortcutReplay } from '../src/features/background/shortcuts';
import type { RunPageAction } from '../src/types';

const action: RunPageAction = { id: 'a1', type: 'CLICK', selector: '#go' };

describe('planShortcutReplay', () => {
  it('replays a recorded page-action shortcut via the actions path', () => {
    expect(planShortcutReplay({ actions: [action], prompt: undefined })).toEqual({
      kind: 'actions',
    });
  });

  it('routes a prompt shortcut (empty actions + prompt) through the chat path', () => {
    expect(planShortcutReplay({ actions: [], prompt: 'summarize this page' })).toEqual({
      kind: 'prompt',
      prompt: 'summarize this page',
    });
  });

  it('trims the prompt and still routes to chat', () => {
    expect(planShortcutReplay({ actions: [], prompt: '  do the thing  ' })).toEqual({
      kind: 'prompt',
      prompt: 'do the thing',
    });
  });

  it('reports empty when there are neither actions nor a prompt (no fake success)', () => {
    expect(planShortcutReplay({ actions: [], prompt: undefined })).toEqual({ kind: 'empty' });
    expect(planShortcutReplay({ actions: [], prompt: '   ' })).toEqual({ kind: 'empty' });
  });

  it('prefers recorded actions when a shortcut somehow carries both', () => {
    expect(planShortcutReplay({ actions: [action], prompt: 'ignored' })).toEqual({
      kind: 'actions',
    });
  });
});
