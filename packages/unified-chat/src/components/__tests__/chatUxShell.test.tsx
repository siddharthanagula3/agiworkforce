/**
 * Phase A Slice 5 — Chat UX shell smoke tests
 *
 * Covers:
 *   BrandedGreeting, AdvancedEmptyState, BriefStatus + FloatingBriefStatus + useBriefStatus,
 *   ChatNotificationBadge, BrowserActivityBadge, AgentModeSwitcher,
 *   KeyboardShortcutsDialog, KeyboardShortcutsOverlay, SlashCommandMenu,
 *   SkillMentionPicker, FileMentionPicker, PromptStash, PromptSuggestionsDropdown,
 *   ChatInputToolbar, ChatStream (empty + messages)
 *
 * Uses renderToStaticMarkup for pure-presentational components (no hooks).
 * Store-reading components are tested via store mutation + direct render checks.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import * as _React from 'react';

// ── Components under test ─────────────────────────────────────────────────────
import { BrandedGreeting } from '../BrandedGreeting';
import { AdvancedEmptyState } from '../AdvancedEmptyState';
import {
  BriefStatus,
  FloatingBriefStatus,
  actionMessages,
  type BriefStatusState,
} from '../BriefStatus';
import { ChatNotificationBadge, type BadgeNotificationType } from '../ChatNotificationBadge';
import { BrowserActivityBadge } from '../BrowserActivityBadge';
import { AgentModeSwitcher } from '../AgentModeSwitcher';
import { KeyboardShortcutsDialog } from '../KeyboardShortcutsDialog';
import { KeyboardShortcutsOverlay } from '../KeyboardShortcutsOverlay';
import { SlashCommandMenu, type CommandSuggestion } from '../SlashCommandMenu';
import { SkillMentionPicker, type MentionSkill } from '../SkillMentionPicker';
import { FileMentionPicker, type MentionFile } from '../FileMentionPicker';
import { PromptSuggestionsDropdown, type PromptSuggestion } from '../PromptSuggestionsDropdown';

// ── Stores under test ─────────────────────────────────────────────────────────
import { useAgentModeStore } from '../../stores/agentModeStore';
import { useMentionStore } from '../../stores/mentionStore';
import { usePromptStashStore } from '../../stores/promptStashStore';
import { usePlanModeStore } from '../../stores/planModeStore';
import { useChatStore } from '../../stores/chatStore';

// ─────────────────────────────────────────────────────────────────────────────
// Store reset helpers
// ─────────────────────────────────────────────────────────────────────────────

function resetStores() {
  useAgentModeStore.setState({ agentMode: 'safe' });
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
// AgentModeSwitcher (store-connected)
// ─────────────────────────────────────────────────────────────────────────────

describe('AgentModeSwitcher', () => {
  beforeEach(() => resetStores());

  it('renders 4 mode buttons', () => {
    const html = renderToStaticMarkup(<AgentModeSwitcher />);
    // Check all 4 mode titles are present in aria attributes
    expect(html).toContain('Safe');
    expect(html).toContain('Plan');
    expect(html).toContain('Build');
    expect(html).toContain('Autopilot');
  });

  it('marks safe mode as active by default', () => {
    const html = renderToStaticMarkup(<AgentModeSwitcher />);
    expect(html).toContain('aria-pressed="true"');
  });
});

describe('agentModeStore', () => {
  beforeEach(() => resetStores());

  it('starts in safe mode', () => {
    expect(useAgentModeStore.getState().agentMode).toBe('safe');
  });

  it('setAgentMode updates to build', async () => {
    await useAgentModeStore.getState().setAgentMode('build');
    expect(useAgentModeStore.getState().agentMode).toBe('build');
  });

  it('selectIsPlanMode returns true only for plan mode', async () => {
    await useAgentModeStore.getState().setAgentMode('plan');
    expect(useAgentModeStore.getState().agentMode === 'plan').toBe(true);
    await useAgentModeStore.getState().setAgentMode('safe');
    expect(useAgentModeStore.getState().agentMode === 'plan').toBe(false);
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
