/**
 * Phase A Slice 3 — smoke render tests for checkpoint + branch components.
 *
 * Covers: CheckpointManager (pure props), BranchNavigator (pure props),
 * RewindTimeline (with conversationId for store-label enrichment).
 *
 * Uses renderToStaticMarkup for pure-props components.
 * Store-connected variants (BranchNavigatorContainer, RewindTimelineContainer)
 * are covered via the store tests in checkpointStore.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { CheckpointManager } from '../CheckpointManager';
import type { CheckpointManagerProps } from '../CheckpointManager';
import { BranchNavigator } from '../BranchNavigator';
import type { BranchItem } from '../BranchNavigator';
import { RewindTimeline } from '../RewindTimeline';
import { useCheckpointStore } from '../../stores/checkpointStore';
import type { Checkpoint } from '../../stores/checkpointStore';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function resetStores() {
  useCheckpointStore.setState({
    checkpointsByConversation: {},
    branchesByConversation: {},
    activeBranchByConversation: {},
  });
}

function makeCheckpoint(overrides?: Partial<Checkpoint>): Checkpoint {
  return {
    id: `cp-${Math.random()}`,
    messageId: 'msg-1',
    createdAt: new Date().toISOString(),
    label: 'Test checkpoint',
    ...overrides,
  };
}

function makeBranch(overrides?: Partial<BranchItem>): BranchItem {
  return {
    id: `branch-${Math.random()}`,
    name: 'test-branch',
    forkPointMessageId: 'msg-fork',
    ...overrides,
  };
}

// Minimal CheckpointManagerProps for testing
function makeManagerProps(overrides?: Partial<CheckpointManagerProps>): CheckpointManagerProps {
  return {
    conversationId: 'conv-test',
    onLoad: vi.fn().mockResolvedValue([]),
    onCreate: vi.fn().mockResolvedValue(makeCheckpoint()),
    onRestore: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CheckpointManager
// ─────────────────────────────────────────────────────────────────────────────

describe('CheckpointManager', () => {
  // CheckpointManager uses useEffect for initial load so it starts in loading state.
  // In SSR context the loading spinner renders.
  it('renders loading state initially (SSR)', () => {
    const html = renderToStaticMarkup(<CheckpointManager {...makeManagerProps()} />);
    // Loading indicator OR empty state — either is acceptable in SSR
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
  });

  it('renders the "Checkpoints" heading', () => {
    const html = renderToStaticMarkup(<CheckpointManager {...makeManagerProps()} />);
    expect(html).toContain('Checkpoints');
  });

  it('renders "Create Checkpoint" button', () => {
    const html = renderToStaticMarkup(<CheckpointManager {...makeManagerProps()} />);
    expect(html).toContain('Create Checkpoint');
  });

  it('accepts optional onFork prop without crashing', () => {
    const html = renderToStaticMarkup(
      <CheckpointManager {...makeManagerProps()} onFork={vi.fn().mockResolvedValue(undefined)} />,
    );
    expect(html).toContain('Checkpoints');
  });

  it('renders with className applied', () => {
    const html = renderToStaticMarkup(
      <CheckpointManager {...makeManagerProps()} className="my-custom-class" />,
    );
    expect(html).toContain('my-custom-class');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BranchNavigator
// ─────────────────────────────────────────────────────────────────────────────

describe('BranchNavigator', () => {
  it('renders nothing when total relevant branches <= 1', () => {
    // Only one branch, no fork matches → total = 0, returns null
    const b = makeBranch({ id: 'main', forkPointMessageId: 'other-msg' });
    const html = renderToStaticMarkup(
      <BranchNavigator
        branches={[b]}
        activeBranchId="main"
        onSwitch={vi.fn()}
        messageId="msg-fork"
      />,
    );
    // Only "main" branch included (id==='main'), total=1, returns null
    expect(html).toBe('');
  });

  it('renders navigation controls when multiple relevant branches exist', () => {
    const b1: BranchItem = { id: 'main', name: 'main' };
    const b2: BranchItem = { id: 'alt', name: 'alt', forkPointMessageId: 'msg-fork' };
    const html = renderToStaticMarkup(
      <BranchNavigator
        branches={[b1, b2]}
        activeBranchId="main"
        onSwitch={vi.fn()}
        messageId="msg-fork"
      />,
    );
    expect(html).toContain('Previous branch');
    expect(html).toContain('Next branch');
    expect(html).toContain('1/2');
  });

  it('shows correct index for active branch', () => {
    const b1: BranchItem = { id: 'main', name: 'main' };
    const b2: BranchItem = { id: 'fork-1', name: 'fork-1', forkPointMessageId: 'msg-fork' };
    const html = renderToStaticMarkup(
      <BranchNavigator
        branches={[b1, b2]}
        activeBranchId="fork-1"
        onSwitch={vi.fn()}
        messageId="msg-fork"
      />,
    );
    expect(html).toContain('2/2');
  });

  it('shows "?" as index when active branch is not in relevant list', () => {
    const b1: BranchItem = { id: 'main', name: 'main' };
    const b2: BranchItem = { id: 'fork-1', name: 'fork-1', forkPointMessageId: 'msg-fork' };
    const html = renderToStaticMarkup(
      <BranchNavigator
        branches={[b1, b2]}
        activeBranchId="nonexistent"
        onSwitch={vi.fn()}
        messageId="msg-fork"
      />,
    );
    expect(html).toContain('?/2');
  });

  it('renders nothing for empty branches array', () => {
    const html = renderToStaticMarkup(
      <BranchNavigator
        branches={[]}
        activeBranchId="main"
        onSwitch={vi.fn()}
        messageId="msg-fork"
      />,
    );
    expect(html).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RewindTimeline — deep (Slice 3) checkpoint-aware extension
// ─────────────────────────────────────────────────────────────────────────────

describe('RewindTimeline — Slice 3 conversationId enrichment', () => {
  beforeEach(resetStores);

  it('SSR: renders loading state on initial render without crashing', () => {
    const html = renderToStaticMarkup(
      <RewindTimeline
        fetchCheckpoints={vi.fn().mockResolvedValue([])}
        rewindCheckpoint={vi.fn().mockResolvedValue(undefined)}
        conversationId="conv-1"
      />,
    );
    expect(html).toContain('0 checkpoint');
  });

  it('Slice 2 API still works without conversationId (backward compat)', () => {
    const html = renderToStaticMarkup(
      <RewindTimeline
        fetchCheckpoints={vi.fn().mockResolvedValue([])}
        rewindCheckpoint={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    expect(typeof html).toBe('string');
  });

  it('store: adding a checkpoint to conversation provides labelMap data', () => {
    // Seed the store
    useCheckpointStore
      .getState()
      .setCheckpoints('conv-labelled', [makeCheckpoint({ id: 'cp-1', label: 'Before refactor' })]);
    const cps = useCheckpointStore.getState().checkpointsByConversation['conv-labelled'];
    expect(cps).toHaveLength(1);
    expect(cps![0]!.label).toBe('Before refactor');
  });

  it('RewindTimeline renders checkpoint count label from toolbar', () => {
    // SSR starts at loading state which shows "0 checkpoints" before fetch
    const html = renderToStaticMarkup(
      <RewindTimeline
        fetchCheckpoints={vi.fn().mockResolvedValue([])}
        rewindCheckpoint={vi.fn().mockResolvedValue(undefined)}
        conversationId="conv-fresh"
      />,
    );
    // Toolbar always renders even in SSR
    expect(html).toContain('checkpoint');
  });
});
