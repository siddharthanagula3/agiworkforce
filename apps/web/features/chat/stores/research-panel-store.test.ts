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
      sources: [],
      query: undefined,
      conversationId: null,
    });
  });

  it('returns sources only for the conversation they belong to', () => {
    useResearchPanelStore.getState().setSources('conv-a', SRC_A, 'anthropic news');

    const store = useResearchPanelStore.getState();
    expect(store.sourcesFor('conv-a').sources).toHaveLength(2);
    expect(store.sourcesFor('conv-a').query).toBe('anthropic news');
    // A different chat (e.g. one that ran no web search) sees nothing — not stale sources.
    expect(store.sourcesFor('conv-b').sources).toHaveLength(0);
    expect(store.sourcesFor('conv-b').query).toBeUndefined();
  });

  it('treats a null/undefined active conversation as no sources', () => {
    useResearchPanelStore.getState().setSources('conv-a', SRC_A);
    const store = useResearchPanelStore.getState();
    expect(store.sourcesFor(null).sources).toHaveLength(0);
    expect(store.sourcesFor(undefined).sources).toHaveLength(0);
  });

  it('switching conversations replaces, never merges, the visible sources', () => {
    const store = useResearchPanelStore.getState();
    store.setSources('conv-a', SRC_A);
    store.setSources('conv-b', SRC_B);

    const after = useResearchPanelStore.getState();
    // conv-a no longer matches the stored conversation -> empty (no leak).
    expect(after.sourcesFor('conv-a').sources).toHaveLength(0);
    expect(after.sourcesFor('conv-b').sources).toHaveLength(1);
  });

  it('openPanel scopes sources to the opening conversation', () => {
    useResearchPanelStore.getState().openPanel('conv-a', SRC_A, 'q');
    const store = useResearchPanelStore.getState();
    expect(store.panelOpen).toBe(true);
    expect(store.sourcesFor('conv-a').sources).toHaveLength(2);
    expect(store.sourcesFor('conv-other').sources).toHaveLength(0);
  });
});
