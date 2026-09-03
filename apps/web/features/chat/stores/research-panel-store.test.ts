import { beforeEach, describe, expect, it } from 'vitest';
import { useResearchPanelStore, type ResearchSource } from './research-panel-store';

const SRC_A: ResearchSource[] = [
  { url: 'https://techcrunch.com/x', title: 'TechCrunch' },
  { url: 'https://reuters.com/y', title: 'Reuters' },
];
const SRC_B: ResearchSource[] = [{ url: 'https://kickresume.com/z', title: 'Kickresume' }];

describe('research panel store (per-conversation scoping)', () => {
  beforeEach(() => {
    useResearchPanelStore.setState({
      panelOpen: false,
      messageId: null,
      cited: [],
      more: [],
      query: undefined,
      conversationId: null,
    });
  });

  it('returns sources only for the conversation they belong to', () => {
    useResearchPanelStore.getState().setSources('conv-a', 'msg-1', SRC_A, [], 'anthropic news');

    const store = useResearchPanelStore.getState();
    expect(store.sourcesFor('conv-a').cited).toHaveLength(2);
    expect(store.sourcesFor('conv-a').query).toBe('anthropic news');
    expect(store.sourcesFor('conv-b').cited).toHaveLength(0);
    expect(store.sourcesFor('conv-b').query).toBeUndefined();
  });

  it('treats a null/undefined active conversation as no sources', () => {
    useResearchPanelStore.getState().setSources('conv-a', 'msg-1', SRC_A, []);
    const store = useResearchPanelStore.getState();
    expect(store.sourcesFor(null).cited).toHaveLength(0);
    expect(store.sourcesFor(undefined).cited).toHaveLength(0);
  });

  it('switching conversations replaces, never merges, the visible sources', () => {
    const store = useResearchPanelStore.getState();
    store.setSources('conv-a', 'msg-1', SRC_A, []);
    store.setSources('conv-b', 'msg-2', SRC_B, []);

    const after = useResearchPanelStore.getState();
    expect(after.sourcesFor('conv-a').cited).toHaveLength(0);
    expect(after.sourcesFor('conv-b').cited).toHaveLength(1);
  });

  it('openPanel scopes sources to the opening conversation', () => {
    useResearchPanelStore.getState().openPanel('conv-a', 'msg-1', SRC_A, [], 'q');
    const store = useResearchPanelStore.getState();
    expect(store.panelOpen).toBe(true);
    expect(store.sourcesFor('conv-a').cited).toHaveLength(2);
    expect(store.sourcesFor('conv-other').cited).toHaveLength(0);
  });

  it('opening an older message replaces whichever message was showing', () => {
    const store = useResearchPanelStore.getState();
    store.openPanel('conv-a', 'msg-2', SRC_B, [], 'newer');
    store.openPanel('conv-a', 'msg-1', SRC_A, [], 'older');

    const after = useResearchPanelStore.getState();
    expect(after.sourcesFor('conv-a').messageId).toBe('msg-1');
    expect(after.sourcesFor('conv-a').cited).toHaveLength(2);
  });

  it('ignores the passive mirror while the panel is open on an explicit message', () => {
    const store = useResearchPanelStore.getState();
    store.openPanel('conv-a', 'msg-1', SRC_A, [], 'older');
    store.setSources('conv-a', 'msg-2', SRC_B, []);

    const after = useResearchPanelStore.getState();
    expect(after.sourcesFor('conv-a').messageId).toBe('msg-1');
    expect(after.sourcesFor('conv-a').cited).toHaveLength(2);
  });
});
