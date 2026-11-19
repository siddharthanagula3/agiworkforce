import { beforeEach, describe, expect, it } from 'vitest';

import { useChatStore } from '@shared/stores/web-chat-store';
import {
  WORK_ENTRY_POINTS,
  WORK_ENTRY_POINT_LABELS,
  buildWorkObjective,
  mergeIntoDraft,
  startWork,
} from '..';

function draft(conversationId: string | null): string {
  return (
    useChatStore.getState().draftsByConversation[conversationId ?? '__new_conversation__'] ?? ''
  );
}

function workMode(conversationId: string | null) {
  return useChatStore.getState().getComposerToggles(conversationId).workMode;
}

beforeEach(() => {
  useChatStore.setState({ draftsByConversation: {}, composerTogglesByConversation: {} });
});

describe('Work entry points', () => {
  it('offers a labelled entry point for a file, artifact, connector result, page and window', () => {
    expect(WORK_ENTRY_POINTS).toEqual([
      'file',
      'artifact',
      'connector_result',
      'browser_page',
      'desktop_context',
    ]);
    for (const entryPoint of WORK_ENTRY_POINTS) {
      expect(WORK_ENTRY_POINT_LABELS[entryPoint]).toMatch(/^Start Work from/);
    }
  });

  it.each(WORK_ENTRY_POINTS)(
    'starts Work from a %s and carries its source into the objective',
    (entryPoint) => {
      startWork({
        source: { entryPoint, title: 'Q3 report', reference: 'files/q3.pdf' },
        conversationId: null,
      });

      expect(workMode(null)).toBe('agiwork');
      expect(draft(null)).toContain('Q3 report');
      expect(draft(null)).toContain('Source: files/q3.pdf');
    },
  );

  it('keeps a draft the person already typed and appends the objective under it', () => {
    useChatStore.getState().setDraftContent('summarise this for the board', 'conv-1');
    startWork({
      conversationId: 'conv-1',
      source: { entryPoint: 'artifact', title: 'Pricing model' },
    });

    expect(draft('conv-1')).toBe(
      'summarise this for the board\n\nWork from the artifact Pricing model',
    );
  });

  it('builds an objective without inventing a source line it was not given', () => {
    expect(
      buildWorkObjective({ source: { entryPoint: 'browser_page', title: 'Pricing page' } }),
    ).toBe('Work from the page Pricing page');
    expect(mergeIntoDraft('   ', 'objective')).toBe('objective');
  });
});
