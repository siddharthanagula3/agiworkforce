import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';

import * as _React from 'react';
import { act } from 'react';

import { BrandedGreeting } from '../BrandedGreeting';
import { resolveGreetingHeadline } from '@agiworkforce/utils/greeting';
import { ChatInterface } from '../ChatInterface';
import { EmptyState } from '../EmptyState';
import { SlashCommandMenu, type CommandSuggestion } from '../SlashCommandMenu';
import { SkillMentionPicker, type MentionSkill } from '../SkillMentionPicker';

import { useMentionStore } from '../../stores/mentionStore';
import { usePlanModeStore } from '../../stores/planModeStore';
import { useChatStore } from '../../stores/chatStore';
import { useArtifactStore } from '../../stores/artifactStore';
import { useUIStore } from '../../stores/uiStore';
import type { ChatRuntime } from '../../lib/runtime';

function resetStores() {
  useMentionStore.setState({ activeTrigger: null, query: '', cursorIndex: 0 });
  usePlanModeStore.setState({ planMode: false, pendingPlan: null });
  useChatStore.setState({
    conversations: [],
    messagesByConversation: {},
    activeConversationId: null,
    isStreaming: false,
  });
}

describe('BrandedGreeting', () => {
  it('renders the headline the host resolved', () => {
    const html = renderToStaticMarkup(<BrandedGreeting headline="Good morning, Alice" />);
    expect(html).toContain('Good morning, Alice');
  });

  it('derives a time-band headline from the clock when the host passes none', () => {
    const html = renderToStaticMarkup(<BrandedGreeting userName="Alice Wonderland" />);
    expect(html).toContain(resolveGreetingHeadline(new Date(), 'Alice Wonderland'));
    expect(html).not.toContain('Wonderland');
  });

  it('applies custom className', () => {
    const html = renderToStaticMarkup(<BrandedGreeting className="my-custom-class" />);
    expect(html).toContain('my-custom-class');
  });

  it('draws the brand mark and the greeting sans from tokens, never a hardcoded palette', () => {
    const html = renderToStaticMarkup(<BrandedGreeting headline="Good evening" />);
    expect(html).toContain('var(--chat-font-greeting)');
    expect(html).not.toContain('--chat-font-display');
    expect(html).toContain('var(--chat-text-primary)');
    expect(html).not.toContain('violet');
  });

  it('offers the workspace headline when a host scopes the greeting to a folder', () => {
    const html = renderToStaticMarkup(
      <BrandedGreeting headline="Good evening" workspaceLabel="agiworkforce" />,
    );
    expect(html).toContain('What should we build in');
    expect(html).toContain('agiworkforce');
  });
});

describe('ChatInterface host ownership slots', () => {
  beforeEach(resetStores);

  it('replaces the default content-area empty state with the host slot', () => {
    const html = renderToStaticMarkup(
      <ChatInterface
        runtime={null}
        sidebarSlot={null}
        emptyStateSlot={<div data-host-empty-state="">Desktop empty</div>}
        enableSearchOverlay={false}
      />,
    );

    expect(html).toContain('Desktop empty');
    expect(html).not.toContain('What can I help with?');
  });

  it('renders no quick-action chips on an empty chat, whatever the runtime declares', () => {
    const runtime = {
      supportsResearch: true,
      supportsImageGeneration: true,
      supportsVideoGeneration: false,
      supportsComputerUse: false,
    } as ChatRuntime;

    const html = renderToStaticMarkup(
      <ChatInterface runtime={runtime} sidebarSlot={null} enableSearchOverlay={false} />,
    );

    expect(html).not.toContain('>Code<');
    expect(html).not.toContain('>Research<');
    expect(html).not.toContain('>Image<');
    expect(html).not.toContain('>Video<');
    expect(html).not.toContain('>Computer<');
  });

  it('keeps the empty-state badge CTA host-configurable', () => {
    const html = renderToStaticMarkup(
      <EmptyState
        headline="What can I help with, Local?"
        planBadgeLabel="Local Mode"
        planBadgeActionLabel="Cloud Sync"
        showPlanBadgeNoun={false}
      />,
    );

    expect(html).toContain('Local Mode');
    expect(html).toContain('Cloud Sync');
    expect(html).not.toContain('Local Mode plan');
    expect(html).not.toContain('Upgrade');
  });

  it('does not render a default badge CTA when the host omits one', () => {
    const html = renderToStaticMarkup(
      <EmptyState
        headline="What can I help with, Local?"
        planBadgeLabel="Local Mode"
        showPlanBadgeNoun={false}
      />,
    );

    expect(html).toContain('Local Mode');
    expect(html).not.toContain('Upgrade');
    expect(html).not.toContain('Cloud Sync');
  });
});

describe('SlashCommandMenu', () => {
  const suggestions: CommandSuggestion[] = [
    { command: '/plan', description: 'Toggle plan mode', example: '/plan', icon: '📋' },
    { command: '/rewind', description: 'Open rewind timeline', example: '/rewind [id]' },
  ];

  it('renders nothing when show is false', () => {
    const html = renderToStaticMarkup(
      <SlashCommandMenu
        show={false}
        suggestions={suggestions}
        selectedIndex={0}
        onSelect={() => {}}
        onHover={() => {}}
      />,
    );
    expect(html).toBe('');
  });

  it('renders suggestions when show is true', () => {
    const html = renderToStaticMarkup(
      <SlashCommandMenu
        show={true}
        suggestions={suggestions}
        selectedIndex={0}
        onSelect={() => {}}
        onHover={() => {}}
      />,
    );
    expect(html).toContain('/plan');
    expect(html).toContain('/rewind');
  });

  it('marks selected item with aria-selected', () => {
    const html = renderToStaticMarkup(
      <SlashCommandMenu
        show={true}
        suggestions={suggestions}
        selectedIndex={1}
        onSelect={() => {}}
        onHover={() => {}}
      />,
    );
    const trueMatches = html.match(/aria-selected="true"/g) ?? [];
    expect(trueMatches).toHaveLength(1);
  });
});

describe('SkillMentionPicker', () => {
  const skills: MentionSkill[] = [
    { id: 'backend-engineer', name: 'Backend Engineer', category: 'Engineering' },
    { id: 'data-analyst', name: 'Data Analyst', category: 'Data' },
    { id: 'ux-designer', name: 'UX Designer', category: 'Design' },
  ];

  it('renders nothing when no skills match query', () => {
    const html = renderToStaticMarkup(
      <SkillMentionPicker query="zzz" skills={skills} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(html).toBe('');
  });

  it('renders all skills on empty query', () => {
    const html = renderToStaticMarkup(
      <SkillMentionPicker query="" skills={skills} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(html).toContain('Backend Engineer');
    expect(html).toContain('Data Analyst');
    expect(html).toContain('UX Designer');
  });

  it('filters by query', () => {
    const html = renderToStaticMarkup(
      <SkillMentionPicker query="back" skills={skills} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(html).toContain('Backend Engineer');
    expect(html).not.toContain('Data Analyst');
  });
});

describe('mentionStore', () => {
  beforeEach(() => resetStores());

  it('starts with no active trigger', () => {
    expect(useMentionStore.getState().activeTrigger).toBeNull();
  });

  it('openMention sets trigger and query', () => {
    useMentionStore.getState().openMention('@skill', 'backend');
    const s = useMentionStore.getState();
    expect(s.activeTrigger).toBe('@skill');
    expect(s.query).toBe('backend');
    expect(s.cursorIndex).toBe(0);
  });

  it('closeMention resets all fields', () => {
    useMentionStore.getState().openMention('@file', 'src');
    useMentionStore.getState().closeMention();
    const s = useMentionStore.getState();
    expect(s.activeTrigger).toBeNull();
    expect(s.query).toBe('');
    expect(s.cursorIndex).toBe(0);
  });

  it('moveCursor wraps around downward', () => {
    useMentionStore.getState().openMention('@skill');
    useMentionStore.setState({ cursorIndex: 2 });
    useMentionStore.getState().moveCursor('down', 3);
    expect(useMentionStore.getState().cursorIndex).toBe(0);
  });

  it('moveCursor wraps around upward', () => {
    useMentionStore.getState().openMention('@skill');
    useMentionStore.setState({ cursorIndex: 0 });
    useMentionStore.getState().moveCursor('up', 3);
    expect(useMentionStore.getState().cursorIndex).toBe(2);
  });
});

import { ChatInputToolbar } from '../ChatInputToolbar';

describe('ChatInputToolbar plan-mode toggle (Task #18)', () => {
  beforeEach(() => resetStores());

  it('renders toolbar with plan mode button', () => {
    const html = renderToStaticMarkup(<ChatInputToolbar />);
    expect(html).toContain('plan mode');
    expect(html).toContain('lucide-book-open');
  });

  it('toolbar has model slot placeholder', () => {
    const html = renderToStaticMarkup(<ChatInputToolbar />);
    expect(html).toContain('Model');
  });

  it('toolbar accepts custom model selector slot', () => {
    const html = renderToStaticMarkup(
      <ChatInputToolbar modelSelector={<span className="my-model-sel">GPT</span>} />,
    );
    expect(html).toContain('my-model-sel');
    expect(html).toContain('GPT');
  });

  it('planModeStore: togglePlanMode flips the flag', () => {
    usePlanModeStore.setState({ planMode: false, pendingPlan: null });
    usePlanModeStore.getState().togglePlanMode();
    expect(usePlanModeStore.getState().planMode).toBe(true);
    usePlanModeStore.getState().togglePlanMode();
    expect(usePlanModeStore.getState().planMode).toBe(false);
  });
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

function renderClient(node: _React.ReactElement): {
  html: string;
  container: HTMLDivElement;
  unmount: () => void;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return {
    html: container.innerHTML,
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('ChatInterface error presentation', () => {
  beforeEach(resetStores);

  it('turns a conversation HTTP failure into actionable copy and keeps Retry', async () => {
    useChatStore.setState({ activeConversationId: 'conv-error' });
    const runtime = {
      loadMessages: vi.fn(async () => {
        throw new Error('HTTP 401');
      }),
    } as unknown as ChatRuntime;

    const rendered = renderClient(
      <ChatInterface runtime={runtime} sidebarSlot={null} enableSearchOverlay={false} />,
    );
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(rendered.container.textContent).toContain('Your session has expired');
      expect(rendered.container.textContent).not.toContain('HTTP 401');
      expect(
        Array.from(rendered.container.querySelectorAll('button')).some(
          (button) => button.textContent === 'Try again',
        ),
      ).toBe(true);
    } finally {
      rendered.unmount();
    }
  });

  it('does not expose an internal render exception', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const BrokenContent = () => {
      throw new Error('HTTP 500: SELECT secret FROM accounts');
    };

    const rendered = renderClient(
      <ChatInterface
        runtime={null}
        sidebarSlot={null}
        emptyStateSlot={<BrokenContent />}
        enableSearchOverlay={false}
      />,
    );
    try {
      expect(rendered.container.textContent).toContain('Something went wrong on our side');
      expect(rendered.container.textContent).not.toContain('SELECT secret');
      expect(rendered.container.textContent).not.toContain('HTTP 500');
      expect(
        Array.from(rendered.container.querySelectorAll('button')).some(
          (button) => button.textContent === 'Try again',
        ),
      ).toBe(true);
    } finally {
      rendered.unmount();
      consoleError.mockRestore();
    }
  });
});

describe('ChatInterface artifact panel wiring', () => {
  beforeEach(() => {
    resetStores();
    useArtifactStore.setState({
      activeArtifact: null,
      viewMode: 'preview',
      artifactsByConversation: {},
    });
    useUIStore.setState({ activeRightPanel: null });
  });

  it('renders an inline artifact chip on the message that produced it', () => {
    useChatStore.setState({
      activeConversationId: 'conv-1',
      messagesByConversation: {
        'conv-1': [
          {
            id: 'msg-1',
            role: 'assistant',
            content: 'Here is your file.',
            createdAt: new Date().toISOString(),
            artifacts: [
              {
                id: 'artifact-1',
                type: 'markdown',
                title: 'Release Notes',
                content: '# Hello Artifact',
              },
            ],
          },
        ],
      },
    });

    const { html, unmount } = renderClient(
      <ChatInterface runtime={null} enableSearchOverlay={false} />,
    );
    try {
      expect(html).toContain('Release Notes');
    } finally {
      unmount();
    }
  });

  it('opens with the real artifact content and offers no Edit when the runtime cannot save one', () => {
    const artifact = {
      id: 'artifact-1',
      type: 'markdown' as const,
      title: 'Release Notes',
      content: '# Hello Artifact',
    };
    useChatStore.setState({
      activeConversationId: 'conv-1',
      messagesByConversation: {
        'conv-1': [
          {
            id: 'msg-1',
            role: 'assistant',
            content: 'Here is your file.',
            createdAt: new Date().toISOString(),
            artifacts: [artifact],
          },
        ],
      },
    });
    useArtifactStore.setState({ activeArtifact: artifact, viewMode: 'code' });
    useUIStore.setState({ activeRightPanel: 'artifact' });

    const { html, unmount } = renderClient(
      <ChatInterface runtime={null} enableSearchOverlay={false} />,
    );
    try {
      expect(html).not.toContain('No artifact selected');
      expect(html).toContain('# Hello Artifact');

      expect(html).not.toContain('Edit artifact');
    } finally {
      unmount();
    }
  });
});

describe('ChatInput composer structure (web parity)', () => {
  beforeEach(resetStores);

  function markup() {
    return renderToStaticMarkup(
      <ChatInterface runtime={null} sidebarSlot={null} enableSearchOverlay={false} />,
    );
  }

  it('renders the round "+" attachment trigger', () => {
    const html = markup();
    expect(html).toContain('aria-label="Add attachment"');
    expect(html).toMatch(/aria-label="Add attachment"[^>]*class="[^"]*rounded-full/);
  });

  it('renders the shared SendButton in the send state with Enter affordance', () => {
    const html = markup();
    expect(html).toContain('aria-label="Send message (Enter)"');
  });

  it('lays the control cluster out as a single non-wrapping row (flex-nowrap)', () => {
    const html = markup();
    expect(html).toContain('flex-nowrap');
    expect(html).not.toContain('flex-wrap items-center gap-x-2 gap-y-1');
  });
});
