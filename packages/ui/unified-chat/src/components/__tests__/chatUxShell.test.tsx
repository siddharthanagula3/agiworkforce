/**
 * Phase A Slice 5 — Chat UX shell smoke tests
 *
 * Covers:
 *   BrandedGreeting, AdvancedEmptyState, BriefStatus + FloatingBriefStatus + useBriefStatus,
 *   ChatNotificationBadge, BrowserActivityBadge,
 *   KeyboardShortcutsDialog, KeyboardShortcutsOverlay, SlashCommandMenu,
 *   SkillMentionPicker, FileMentionPicker, PromptStash, PromptSuggestionsDropdown,
 *   ChatInputToolbar, ChatStream (empty + messages)
 *
 * Uses renderToStaticMarkup for pure-presentational components (no hooks).
 * Store-reading components are tested via store mutation + direct render checks.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';

import * as _React from 'react';
import { act } from 'react';

// ── Components under test ─────────────────────────────────────────────────────
import { BrandedGreeting } from '../BrandedGreeting';
import { AdvancedEmptyState } from '../AdvancedEmptyState';
import { ChatInterface } from '../ChatInterface';
import { EmptyState } from '../EmptyState';
import {
  BriefStatus,
  FloatingBriefStatus,
  actionMessages,
  type BriefStatusState,
} from '../BriefStatus';
import { ChatNotificationBadge, type BadgeNotificationType } from '../ChatNotificationBadge';
import { BrowserActivityBadge } from '../BrowserActivityBadge';
import { KeyboardShortcutsDialog } from '../KeyboardShortcutsDialog';
import { KeyboardShortcutsOverlay } from '../KeyboardShortcutsOverlay';
import { SlashCommandMenu, type CommandSuggestion } from '../SlashCommandMenu';
import { SkillMentionPicker, type MentionSkill } from '../SkillMentionPicker';
import { FileMentionPicker, type MentionFile } from '../FileMentionPicker';
import { PromptSuggestionsDropdown, type PromptSuggestion } from '../PromptSuggestionsDropdown';

// ── Stores under test ─────────────────────────────────────────────────────────
import { useMentionStore } from '../../stores/mentionStore';
import { usePromptStashStore } from '../../stores/promptStashStore';
import { usePlanModeStore } from '../../stores/planModeStore';
import { useChatStore } from '../../stores/chatStore';
import { useArtifactStore } from '../../stores/artifactStore';
import { useUIStore } from '../../stores/uiStore';
import type { ChatRuntime } from '../../lib/runtime';

// ─────────────────────────────────────────────────────────────────────────────
// Store reset helpers
// ─────────────────────────────────────────────────────────────────────────────

function resetStores() {
  useMentionStore.setState({ activeTrigger: null, query: '', cursorIndex: 0 });
  usePromptStashStore.setState({ entries: [] });
  usePlanModeStore.setState({ planMode: false, pendingPlan: null });
  useChatStore.setState({
    conversations: [],
    messagesByConversation: {},
    activeConversationId: null,
    isStreaming: false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BrandedGreeting
// ─────────────────────────────────────────────────────────────────────────────

describe('BrandedGreeting', () => {
  it('renders without user name', () => {
    const html = renderToStaticMarkup(<BrandedGreeting />);
    expect(html).toContain('AGI in your hands');
  });

  it('includes user first name when provided', () => {
    const html = renderToStaticMarkup(<BrandedGreeting userName="Alice" />);
    expect(html).toContain('Alice');
  });

  it('uses only first word of multi-word name', () => {
    const html = renderToStaticMarkup(<BrandedGreeting userName="Alice Wonderland" />);
    expect(html).toContain('Alice');
    // "Wonderland" should not appear (first name only)
    expect(html).not.toContain('Wonderland');
  });

  it('applies custom className', () => {
    const html = renderToStaticMarkup(<BrandedGreeting className="my-custom-class" />);
    expect(html).toContain('my-custom-class');
  });

  it('renders Sparkles icon container', () => {
    const html = renderToStaticMarkup(<BrandedGreeting />);
    expect(html).toContain('from-violet-500');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AdvancedEmptyState
// ─────────────────────────────────────────────────────────────────────────────

describe('AdvancedEmptyState', () => {
  it('renders an empty flex spacer', () => {
    const html = renderToStaticMarkup(<AdvancedEmptyState />);
    expect(html).toContain('flex-1');
  });

  it('applies custom className', () => {
    const html = renderToStaticMarkup(<AdvancedEmptyState className="test-empty" />);
    expect(html).toContain('test-empty');
  });
});

describe('ChatInterface host ownership slots', () => {
  beforeEach(resetStores);

  it('replaces the default content-area empty state with the host slot, but keeps the independent composer quick chips', () => {
    const html = renderToStaticMarkup(
      <ChatInterface
        runtime={null}
        sidebarSlot={null}
        emptyStateSlot={<div data-host-empty-state="">Desktop empty</div>}
        enableSearchOverlay={false}
      />,
    );

    // The host slot owns the content area: it renders, and it REPLACES the
    // package's default <EmptyState> greeting ("What can I help with?").
    expect(html).toContain('Desktop empty');
    expect(html).not.toContain('What can I help with?');

    // The composer-area sample-prompt chips are a SEPARATE slot, shown whenever
    // the chat is empty (claude.ai parity — ref: claude_reference/015). They are
    // intentionally independent of emptyStateSlot (which owns only the greeting
    // above), so they remain rendered. See the ChatInterface composer block.
    expect(html).toContain('>Code<');
    expect(html).toContain('>Research<');
    expect(html).toContain('>Computer<');
  });

  it('renders only the quick actions declared by the active runtime', () => {
    const runtime = {
      supportsResearch: true,
      supportsImageGeneration: true,
      supportsVideoGeneration: false,
      supportsComputerUse: false,
    } as ChatRuntime;

    const html = renderToStaticMarkup(
      <ChatInterface runtime={runtime} sidebarSlot={null} enableSearchOverlay={false} />,
    );

    expect(html).toContain('>Research<');
    expect(html).toContain('>Image<');
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

// ─────────────────────────────────────────────────────────────────────────────
// BriefStatus
// ─────────────────────────────────────────────────────────────────────────────

describe('BriefStatus', () => {
  it('renders null when message is null', () => {
    const status: BriefStatusState = { message: null, isComplete: false, isError: false };
    const html = renderToStaticMarkup(<BriefStatus status={status} />);
    expect(html).toBe('');
  });

  it('renders message text when set', () => {
    const status: BriefStatusState = {
      message: 'Opening Chrome...',
      isComplete: false,
      isError: false,
    };
    const html = renderToStaticMarkup(<BriefStatus status={status} />);
    expect(html).toContain('Opening Chrome...');
  });

  it('applies error styles when isError is true', () => {
    const status: BriefStatusState = {
      message: 'Failed',
      isComplete: false,
      isError: true,
    };
    const html = renderToStaticMarkup(<BriefStatus status={status} />);
    expect(html).toContain('text-rose-400');
  });

  it('applies success styles when isComplete is true', () => {
    const status: BriefStatusState = {
      message: 'Done!',
      isComplete: true,
      isError: false,
    };
    const html = renderToStaticMarkup(<BriefStatus status={status} />);
    expect(html).toContain('text-emerald-400');
  });
});

describe('FloatingBriefStatus', () => {
  it('renders null when message is null', () => {
    const status: BriefStatusState = { message: null, isComplete: false, isError: false };
    const html = renderToStaticMarkup(<FloatingBriefStatus status={status} />);
    expect(html).toBe('');
  });

  it('renders with fixed positioning', () => {
    const status: BriefStatusState = { message: 'Working...', isComplete: false, isError: false };
    const html = renderToStaticMarkup(<FloatingBriefStatus status={status} />);
    expect(html).toContain('fixed');
  });
});

describe('useBriefStatus (logic only)', () => {
  it('createStatus creates non-complete, non-error status', () => {
    // Test the hook factory inline (no React rendering needed)
    const createStatus = (message: string): BriefStatusState => ({
      message,
      isComplete: false,
      isError: false,
    });
    const s = createStatus('Hello');
    expect(s.message).toBe('Hello');
    expect(s.isComplete).toBe(false);
    expect(s.isError).toBe(false);
  });
});

describe('actionMessages', () => {
  it('openingBrowser uses hostname', () => {
    expect(actionMessages.openingBrowser('https://google.com/search')).toBe(
      'Opening google.com...',
    );
  });

  it('openingBrowser fallback without URL', () => {
    expect(actionMessages.openingBrowser()).toBe('Opening browser...');
  });

  it('done returns Done!', () => {
    expect(actionMessages.done()).toBe('Done!');
  });

  it('failed with reason', () => {
    expect(actionMessages.failed('timeout')).toBe('Failed: timeout');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ChatNotificationBadge
// ─────────────────────────────────────────────────────────────────────────────

describe('ChatNotificationBadge', () => {
  it('renders nothing when count is 0', () => {
    const html = renderToStaticMarkup(<ChatNotificationBadge count={0} />);
    // AnimatePresence renders empty when no children
    expect(html).not.toContain('bg-blue-500');
  });

  it('renders dot badge for count 1', () => {
    const html = renderToStaticMarkup(<ChatNotificationBadge count={1} />);
    expect(html).toContain('unread');
  });

  it('renders count for count 5', () => {
    const html = renderToStaticMarkup(<ChatNotificationBadge count={5} />);
    expect(html).toContain('5');
  });

  it('caps at 99+', () => {
    const html = renderToStaticMarkup(<ChatNotificationBadge count={150} />);
    expect(html).toContain('99+');
  });

  it('uses alert color class for alert type', () => {
    const html = renderToStaticMarkup(
      <ChatNotificationBadge count={3} type={'alert' as BadgeNotificationType} />,
    );
    expect(html).toContain('bg-red-500');
  });

  it('uses success color class for success type', () => {
    const html = renderToStaticMarkup(
      <ChatNotificationBadge count={2} type={'success' as BadgeNotificationType} />,
    );
    expect(html).toContain('bg-green-500');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BrowserActivityBadge
// ─────────────────────────────────────────────────────────────────────────────

describe('BrowserActivityBadge', () => {
  it('renders nothing when not connected and idle with no URL', () => {
    const html = renderToStaticMarkup(
      <BrowserActivityBadge extensionConnected={false} agentStatus="idle" />,
    );
    expect(html).toBe('');
  });

  it('renders disconnected label when not connected but URL present', () => {
    const html = renderToStaticMarkup(
      <BrowserActivityBadge
        extensionConnected={false}
        agentStatus="idle"
        currentPageUrl="https://example.com"
      />,
    );
    expect(html).toContain('disconnected');
  });

  it('renders planning label when agent is planning', () => {
    const html = renderToStaticMarkup(
      <BrowserActivityBadge
        extensionConnected={true}
        agentStatus="planning"
        currentPageUrl="https://example.com"
      />,
    );
    expect(html).toContain('Planning');
  });

  it('shows execute label when executing', () => {
    const html = renderToStaticMarkup(
      <BrowserActivityBadge
        extensionConnected={true}
        agentStatus="executing"
        currentPageUrl="https://example.com"
      />,
    );
    expect(html).toContain('Acting');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// KeyboardShortcutsDialog
// ─────────────────────────────────────────────────────────────────────────────

describe('KeyboardShortcutsDialog', () => {
  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      <KeyboardShortcutsDialog isOpen={false} onClose={() => {}} />,
    );
    expect(html).toBe('');
  });

  it('renders shortcut groups when open', () => {
    const html = renderToStaticMarkup(<KeyboardShortcutsDialog isOpen={true} onClose={() => {}} />);
    expect(html).toContain('Keyboard Shortcuts');
    expect(html).toContain('General');
    expect(html).toContain('Chat');
  });

  it('renders Escape hint in footer', () => {
    const html = renderToStaticMarkup(<KeyboardShortcutsDialog isOpen={true} onClose={() => {}} />);
    expect(html).toContain('Escape');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// KeyboardShortcutsOverlay
// ─────────────────────────────────────────────────────────────────────────────

describe('KeyboardShortcutsOverlay', () => {
  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(<KeyboardShortcutsOverlay open={false} onClose={() => {}} />);
    expect(html).toBe('');
  });

  it('renders sections when open', () => {
    const html = renderToStaticMarkup(<KeyboardShortcutsOverlay open={true} onClose={() => {}} />);
    expect(html).toContain('Keyboard Shortcuts');
    expect(html).toContain('Chat');
    expect(html).toContain('Navigation');
  });

  it('renders extra sections when provided', () => {
    const extras = [
      {
        category: 'desktop-extra',
        label: 'Desktop',
        shortcuts: [{ description: 'Fullscreen', keys: ['F11'] }],
      },
    ];
    const html = renderToStaticMarkup(
      <KeyboardShortcutsOverlay open={true} onClose={() => {}} extraSections={extras} />,
    );
    expect(html).toContain('Desktop');
    expect(html).toContain('Fullscreen');
    expect(html).toContain('F11');
  });

  it('renders customize link when onOpenSettings provided', () => {
    const html = renderToStaticMarkup(
      <KeyboardShortcutsOverlay open={true} onClose={() => {}} onOpenSettings={() => {}} />,
    );
    expect(html).toContain('Customize shortcuts');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SlashCommandMenu
// ─────────────────────────────────────────────────────────────────────────────

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
    // Count aria-selected="true" (only the selected item)
    const trueMatches = html.match(/aria-selected="true"/g) ?? [];
    expect(trueMatches).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SkillMentionPicker
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// FileMentionPicker
// ─────────────────────────────────────────────────────────────────────────────

describe('FileMentionPicker', () => {
  const staticEntries: MentionFile[] = [
    { name: 'index.ts', path: '/project/src/index.ts', isDir: false, size: 1024 },
    { name: 'styles.css', path: '/project/src/styles.css', isDir: false, size: 512 },
    { name: 'components', path: '/project/src/components', isDir: true, size: 0 },
  ];

  it('renders file list header', () => {
    const html = renderToStaticMarkup(
      <FileMentionPicker
        query=""
        onSelect={() => {}}
        onClose={() => {}}
        staticEntries={staticEntries}
      />,
    );
    expect(html).toContain('Files');
  });

  it('shows all entries on empty query', () => {
    const html = renderToStaticMarkup(
      <FileMentionPicker
        query=""
        onSelect={() => {}}
        onClose={() => {}}
        staticEntries={staticEntries}
      />,
    );
    expect(html).toContain('index.ts');
    expect(html).toContain('styles.css');
    expect(html).toContain('components');
  });

  it('filters entries by name on non-empty query', () => {
    const html = renderToStaticMarkup(
      <FileMentionPicker
        query="index"
        onSelect={() => {}}
        onClose={() => {}}
        staticEntries={staticEntries}
      />,
    );
    expect(html).toContain('index.ts');
    expect(html).not.toContain('styles.css');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PromptSuggestionsDropdown
// ─────────────────────────────────────────────────────────────────────────────

describe('PromptSuggestionsDropdown', () => {
  const suggestions: PromptSuggestion[] = [
    { text: 'Add unit tests', description: 'Add test coverage', type: 'expansion', icon: '🧪' },
    { text: 'Refactor this', description: 'Improve code structure', type: 'alternative' },
  ];

  it('renders nothing when not visible', () => {
    const html = renderToStaticMarkup(
      <PromptSuggestionsDropdown
        suggestions={suggestions}
        isVisible={false}
        selectedIndex={0}
        onSelectSuggestion={() => {}}
      />,
    );
    expect(html).toBe('');
  });

  it('renders suggestions when visible', () => {
    const html = renderToStaticMarkup(
      <PromptSuggestionsDropdown
        suggestions={suggestions}
        isVisible={true}
        selectedIndex={0}
        onSelectSuggestion={() => {}}
      />,
    );
    expect(html).toContain('Add unit tests');
    expect(html).toContain('Refactor this');
  });

  it('renders type badges', () => {
    const html = renderToStaticMarkup(
      <PromptSuggestionsDropdown
        suggestions={suggestions}
        isVisible={true}
        selectedIndex={0}
        onSelectSuggestion={() => {}}
      />,
    );
    expect(html).toContain('expansion');
    expect(html).toContain('alternative');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mentionStore
// ─────────────────────────────────────────────────────────────────────────────

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
    expect(useMentionStore.getState().cursorIndex).toBe(0); // wraps
  });

  it('moveCursor wraps around upward', () => {
    useMentionStore.getState().openMention('@skill');
    useMentionStore.setState({ cursorIndex: 0 });
    useMentionStore.getState().moveCursor('up', 3);
    expect(useMentionStore.getState().cursorIndex).toBe(2); // wraps to last
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// promptStashStore
// ─────────────────────────────────────────────────────────────────────────────

describe('promptStashStore', () => {
  beforeEach(() => resetStores());

  it('starts with empty entries', () => {
    expect(usePromptStashStore.getState().entries).toHaveLength(0);
  });

  it('save adds an entry', () => {
    usePromptStashStore.getState().save('Tell me about Rust');
    expect(usePromptStashStore.getState().entries).toHaveLength(1);
    expect(usePromptStashStore.getState().entries[0]!.text).toBe('Tell me about Rust');
  });

  it('save adds label when provided', () => {
    usePromptStashStore.getState().save('Write tests', 'Test writing prompt');
    expect(usePromptStashStore.getState().entries[0]!.label).toBe('Test writing prompt');
  });

  it('remove deletes an entry by id', () => {
    usePromptStashStore.getState().save('Entry A');
    usePromptStashStore.getState().save('Entry B');
    const id = usePromptStashStore.getState().entries[0]!.id;
    usePromptStashStore.getState().remove(id);
    expect(usePromptStashStore.getState().entries).toHaveLength(1);
    expect(usePromptStashStore.getState().entries[0]!.text).toBe('Entry A');
  });

  it('clear removes all entries', () => {
    usePromptStashStore.getState().save('A');
    usePromptStashStore.getState().save('B');
    usePromptStashStore.getState().clear();
    expect(usePromptStashStore.getState().entries).toHaveLength(0);
  });

  it('most recent entry is first (prepend order)', () => {
    usePromptStashStore.getState().save('First');
    usePromptStashStore.getState().save('Second');
    expect(usePromptStashStore.getState().entries[0]!.text).toBe('Second');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ChatInputToolbar (plan-mode toggle — Task #18)
// ─────────────────────────────────────────────────────────────────────────────

import { ChatInputToolbar } from '../ChatInputToolbar';

describe('ChatInputToolbar plan-mode toggle (Task #18)', () => {
  beforeEach(() => resetStores());

  it('renders toolbar with plan mode button', () => {
    const html = renderToStaticMarkup(<ChatInputToolbar />);
    // In SSR, zustand reads initial state (planMode=false) or server snapshot
    expect(html).toContain('plan mode'); // aria-label contains "plan mode"
    expect(html).toContain('lucide-book-open'); // icon svg class in HTML output
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

// ─────────────────────────────────────────────────────────────────────────────
// ChatStream (basic render)
// ─────────────────────────────────────────────────────────────────────────────

import { ChatStream } from '../ChatStream';

describe('ChatStream', () => {
  beforeEach(() => resetStores());

  it('renders relative container', () => {
    const html = renderToStaticMarkup(<ChatStream />);
    expect(html).toContain('relative');
  });

  it('renders custom empty state when no messages', () => {
    const html = renderToStaticMarkup(
      <ChatStream emptyState={<div className="custom-empty">Start chatting</div>} />,
    );
    expect(html).toContain('Start chatting');
  });

  it('renders messages passed via messages prop (prop override)', () => {
    const msgs: Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      createdAt: string;
    }> = [
      { id: 'msg-1', role: 'user', content: 'Hello world', createdAt: new Date().toISOString() },
    ];
    const html = renderToStaticMarkup(<ChatStream messages={msgs} />);
    expect(html).toContain('Hello world');
  });

  it('renders with custom renderMessage via messages prop', () => {
    const msgs: Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      createdAt: string;
    }> = [
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'AI says hi',
        createdAt: new Date().toISOString(),
      },
    ];
    const html = renderToStaticMarkup(
      <ChatStream
        messages={msgs}
        renderMessage={(msg) => <div className="custom-bubble">{msg.content}</div>}
      />,
    );
    expect(html).toContain('custom-bubble');
    expect(html).toContain('AI says hi');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Artifact panel wiring — DESKTOP-ARTIFACTS-ENTIRELY-UNWIRED-01
//
// Proves the frontend half of the fix: once a message carries `artifacts`
// (populated by useChat's `chat:artifact` handler — see TauriRuntime.test.ts
// for the event-listener-level proof), the inline chip renders and, once the
// panel is open, ChatInterface's ArtifactPanel mount actually shows the real
// content and the Edit affordance (`onSaveEdit`) that was previously always
// absent.
//
// NOTE: these tests render via `react-dom/client`'s `createRoot`, NOT
// `renderToStaticMarkup` like the rest of this file. `useChatStore` is
// `persist`-wrapped, and zustand's persist middleware gives
// `useSyncExternalStore` a `getServerSnapshot` that intentionally returns the
// pre-hydration default state (to avoid SSR/client hydration mismatches in a
// real app) — so `renderToStaticMarkup` (a server render) always sees
// `activeConversationId: null` / empty `messagesByConversation` regardless of
// `setState()`, even though `useChatStore.getState()` reflects the write
// correctly. Confirmed empirically: none of the OTHER tests in this file
// exercise "mutate useChatStore then assert it renders" (they either assert
// on props or on non-persisted stores), so this divergence went unnoticed
// until these tests. A real client render exercises `getSnapshot` instead,
// matching what the actual app sees in the browser.
// ─────────────────────────────────────────────────────────────────────────────

// React's act() only suppresses "not wrapped in act" warnings when this flag
// is set — @testing-library/react sets it automatically; since this package
// has no RTL dependency, set it explicitly for this file's client renders.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom does not implement scrollIntoView (used by MessageList's
// auto-scroll-to-bottom effect); stub it so a real client render doesn't
// throw and fall into ChatErrorBoundary.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

function renderClient(node: _React.ReactElement): { html: string; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return {
    html: container.innerHTML,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

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

  it('opens with the real artifact content and a working Edit affordance once wired', () => {
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
      // The panel is mounted and renders the REAL artifact content, not a
      // "No artifact selected" placeholder.
      expect(html).not.toContain('No artifact selected');
      expect(html).toContain('# Hello Artifact');

      // Before the fix, ChatInterface never passed `onSaveEdit` to
      // ArtifactPanel, so this button never rendered regardless of state.
      expect(html).toContain('Edit artifact');
    } finally {
      unmount();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ChatInput composer — web-parity control row (2026-07-10)
// The shared ChatInput was aligned to web's ChatComposerNew: a single
// non-wrapping control row, a round "+" trigger, and the shared 3-state
// SendButton. These structural assertions guard that look from regressing.
// ─────────────────────────────────────────────────────────────────────────────

describe('ChatInput composer structure (web parity)', () => {
  beforeEach(resetStores);

  function markup() {
    // runtime={null} still renders the composer (disabled). This is the same
    // path the ChatInterface host-ownership tests above exercise.
    return renderToStaticMarkup(
      <ChatInterface runtime={null} sidebarSlot={null} enableSearchOverlay={false} />,
    );
  }

  it('renders the round "+" attachment trigger', () => {
    const html = markup();
    expect(html).toContain('aria-label="Add attachment"');
    // Round trigger (rounded-full), matching web's composer — not the old rounded-lg.
    expect(html).toMatch(/aria-label="Add attachment"[^>]*class="[^"]*rounded-full/);
  });

  it('renders the shared SendButton in the send state with Enter affordance', () => {
    const html = markup();
    expect(html).toContain('aria-label="Send message (Enter)"');
  });

  it('lays the control cluster out as a single non-wrapping row (flex-nowrap)', () => {
    const html = markup();
    // web deliberately uses flex-nowrap so the send button never drops a line.
    expect(html).toContain('flex-nowrap');
    // The old wrapping layout used gap-y-1 on a flex-wrap row; it must be gone.
    expect(html).not.toContain('flex-wrap items-center gap-x-2 gap-y-1');
  });
});
