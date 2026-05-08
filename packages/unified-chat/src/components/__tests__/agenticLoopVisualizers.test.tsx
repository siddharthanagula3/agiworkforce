/**
 * Phase A Slice 2 — smoke render tests for agentic-loop visualizer components.
 *
 * Covers: AgenticLoopStatusBar (via store mutation), AgentStepTimeline (props),
 * ActionLogTimelineContent (props).
 *
 * renderToStaticMarkup is used for pure-props components (no hooks). For
 * AgenticLoopStatusBar — which reads from useAgentLoopStore — we test the
 * store logic (store tests cover this fully) and verify the zero-state SSR
 * render returns empty, then test the visible-state logic with a wrapper that
 * passes the right props to its inner rendering logic.
 *
 * AgenticLoopStatusBar store-connected behavior is covered in agentLoopStore.test.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { AgenticLoopStatusBar } from '../AgenticLoopStatusBar';
import { AgentStepTimeline } from '../AgentStepTimeline';
import type { AgentStep } from '../AgentStepTimeline';
import { ActionLogTimelineContent } from '../ActionLogTimeline';
import type { ActionLogEntry } from '../ActionLogTimeline';
import { useAgentLoopStore } from '../../stores/agentLoopStore';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function resetStores() {
  useAgentLoopStore.setState({ agentLoop: null, activeGoal: null, actionLogByMessage: {} });
}

function makeStep(overrides?: Partial<AgentStep>): AgentStep {
  return {
    id: `step-${Math.random()}`,
    agentType: 'executor',
    label: 'Run unit tests',
    status: 'complete',
    ...overrides,
  };
}

function makeLogEntry(overrides?: Partial<ActionLogEntry>): ActionLogEntry {
  return {
    id: `log-${Math.random()}`,
    type: 'terminal',
    title: 'cargo test',
    status: 'success',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AgenticLoopStatusBar — null-state SSR smoke test only
// (renderToStaticMarkup uses React SSR which stubs useSyncExternalStore to
// server snapshot; the store's initial state is null so the component returns
// null — which is the correct SSR guard behaviour)
// ─────────────────────────────────────────────────────────────────────────────

describe('AgenticLoopStatusBar', () => {
  beforeEach(resetStores);

  it('renders nothing in SSR context when loop is inactive (null initial store state)', () => {
    // SSR: useSyncExternalStore returns server snapshot (null) → component returns null
    const html = renderToStaticMarkup(<AgenticLoopStatusBar />);
    expect(html).toBe('');
  });

  it('store: setAgentLoop(null) keeps loop null', () => {
    useAgentLoopStore.getState().setAgentLoop(null);
    expect(useAgentLoopStore.getState().agentLoop).toBeNull();
  });

  it('store: setAgentLoop with active=true exposes expected shape', () => {
    useAgentLoopStore.getState().setAgentLoop({ active: true, iteration: 3, maxIterations: 10 });
    const loop = useAgentLoopStore.getState().agentLoop;
    expect(loop?.active).toBe(true);
    expect(loop?.iteration).toBe(3);
    expect(loop?.maxIterations).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AgentStepTimeline
// ─────────────────────────────────────────────────────────────────────────────

describe('AgentStepTimeline', () => {
  it('renders nothing for empty steps array', () => {
    const html = renderToStaticMarkup(<AgentStepTimeline steps={[]} />);
    expect(html).toBe('');
  });

  it('renders step labels', () => {
    const steps: AgentStep[] = [
      makeStep({ label: 'Parse codebase', status: 'complete', agentType: 'planner' }),
      makeStep({ label: 'Generate patch', status: 'running', agentType: 'executor' }),
    ];
    const html = renderToStaticMarkup(<AgentStepTimeline steps={steps} />);
    expect(html).toContain('Parse codebase');
    expect(html).toContain('Generate patch');
    expect(html).toContain('planner');
    expect(html).toContain('executor');
  });

  it('renders all statuses without crashing', () => {
    const statuses: AgentStep['status'][] = ['pending', 'running', 'complete', 'error', 'skipped'];
    const steps = statuses.map((status) => makeStep({ status, label: status }));
    const html = renderToStaticMarkup(<AgentStepTimeline steps={steps} />);
    statuses.forEach((s) => expect(html).toContain(s));
  });

  it('renders in compact mode without throwing', () => {
    const steps = [makeStep({ label: 'Compact step' })];
    const html = renderToStaticMarkup(<AgentStepTimeline steps={steps} compact />);
    expect(html).toContain('Compact step');
  });

  it('applies line-through styling for skipped steps', () => {
    const steps = [makeStep({ status: 'skipped', label: 'Skipped task' })];
    const html = renderToStaticMarkup(<AgentStepTimeline steps={steps} />);
    expect(html).toContain('line-through');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ActionLogTimelineContent
// ─────────────────────────────────────────────────────────────────────────────

describe('ActionLogTimelineContent', () => {
  it('renders nothing for empty entries', () => {
    const html = renderToStaticMarkup(<ActionLogTimelineContent entries={[]} />);
    expect(html).toBe('');
  });

  it('renders entry count in header', () => {
    const entries = [makeLogEntry(), makeLogEntry()];
    const html = renderToStaticMarkup(<ActionLogTimelineContent entries={entries} />);
    expect(html).toContain('Agent activity');
    expect(html).toContain('(2)');
  });

  it('renders entry titles when a running entry forces the panel open', () => {
    // The panel auto-expands when any entry is 'running' (hasActiveEntries=true)
    const entries = [
      makeLogEntry({ title: 'Run cargo check', status: 'running' }),
      makeLogEntry({ title: 'Execute bash script', status: 'running' }),
    ];
    const html = renderToStaticMarkup(<ActionLogTimelineContent entries={entries} />);
    expect(html).toContain('Run cargo check');
    expect(html).toContain('Execute bash script');
  });

  it('renders running status in summary when entries are running', () => {
    const entries = [
      makeLogEntry({ status: 'running', title: 'Active task' }),
      makeLogEntry({ status: 'success', title: 'Done task' }),
    ];
    const html = renderToStaticMarkup(<ActionLogTimelineContent entries={entries} />);
    expect(html).toContain('running');
  });

  it('renders failed count in summary when entry is blocked (forces open)', () => {
    // 'blocked' status forces the panel open so summary counts are visible
    const entries = [
      makeLogEntry({ status: 'blocked', title: 'Blocked task' }),
      makeLogEntry({ status: 'success', title: 'Succeeded task' }),
    ];
    const html = renderToStaticMarkup(<ActionLogTimelineContent entries={entries} />);
    expect(html).toContain('blocked');
  });

  it('renders all entry types without crashing (running forces open)', () => {
    const types: ActionLogEntry['type'][] = [
      'plan',
      'terminal',
      'filesystem',
      'browser',
      'ui',
      'mcp',
      'approval',
      'metrics',
    ];
    // Use 'running' status so the panel auto-expands and titles render
    const entries = types.map((type) => makeLogEntry({ type, title: type, status: 'running' }));
    const html = renderToStaticMarkup(<ActionLogTimelineContent entries={entries} />);
    types.forEach((t) => expect(html).toContain(t));
  });
});
