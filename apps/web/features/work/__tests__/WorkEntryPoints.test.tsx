import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import { useChatStore } from '@shared/stores/web-chat-store';
import {
  WORK_ENTRY_POINTS,
  WORK_ENTRY_POINT_LABELS,
  buildWorkObjective,
  mergeIntoDraft,
  shouldEscalateToWork,
  useWorkEscalationStore,
  StartWorkMenuItem,
  WorkEscalationNotice,
  type WorkEntryPoint,
} from '..';

const LAUNCHABLE: readonly WorkEntryPoint[] = [
  'file',
  'artifact',
  'connector_result',
  'browser_page',
  'desktop_context',
];

function draft(conversationId: string | null): string {
  return (
    useChatStore.getState().draftsByConversation[conversationId ?? '__new_conversation__'] ?? ''
  );
}

function workMode(conversationId: string | null) {
  return useChatStore.getState().getComposerToggles(conversationId).workMode;
}

beforeEach(() => {
  push.mockClear();
  useChatStore.setState({ draftsByConversation: {}, composerTogglesByConversation: {} });
  useWorkEscalationStore.setState({ byConversation: {}, keptInChat: {} });
});

describe('Work entry points', () => {
  it('offers a labelled entry point for a file, artifact, connector result, page and window', () => {
    for (const entryPoint of LAUNCHABLE) {
      expect(WORK_ENTRY_POINT_LABELS[entryPoint]).toMatch(/^Start Work from/);
    }
    expect(WORK_ENTRY_POINTS).toContain('escalation');
  });

  it.each(LAUNCHABLE)(
    'starts Work from a %s and carries its source into the objective',
    (entryPoint) => {
      render(
        <StartWorkMenuItem
          source={{ entryPoint, title: 'Q3 report', reference: 'files/q3.pdf' }}
        />,
      );

      fireEvent.click(screen.getByRole('menuitem', { name: WORK_ENTRY_POINT_LABELS[entryPoint] }));

      expect(workMode(null)).toBe('agiwork');
      expect(draft(null)).toContain('Q3 report');
      expect(draft(null)).toContain('Source: files/q3.pdf');
      expect(push).toHaveBeenCalledWith('/chat');
    },
  );

  it('keeps a draft the person already typed and appends the objective under it', () => {
    useChatStore.getState().setDraftContent('summarise this for the board', 'conv-1');
    render(
      <StartWorkMenuItem
        conversationId="conv-1"
        source={{ entryPoint: 'artifact', title: 'Pricing model' }}
      />,
    );

    fireEvent.click(screen.getByRole('menuitem'));

    expect(draft('conv-1')).toBe(
      'summarise this for the board\n\nWork from the artifact Pricing model',
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('builds an objective without inventing a source line it was not given', () => {
    expect(
      buildWorkObjective({ source: { entryPoint: 'browser_page', title: 'Pricing page' } }),
    ).toBe('Work from the page Pricing page');
    expect(mergeIntoDraft('   ', 'objective')).toBe('objective');
  });
});

describe('automatic escalation to Work', () => {
  it('escalates only a confident agentic turn, and never one already running as Work', () => {
    expect(shouldEscalateToWork({ type: 'agentic', confidence: 0.85 }, 'chat', false)).toBe(true);
    expect(shouldEscalateToWork({ type: 'agentic', confidence: 0.4 }, 'chat', false)).toBe(false);
    expect(shouldEscalateToWork({ type: 'simple', confidence: 0.99 }, 'chat', false)).toBe(false);
    expect(shouldEscalateToWork({ type: 'agentic', confidence: 0.95 }, 'agiwork', false)).toBe(
      false,
    );
  });

  it('never proposes again once the person chose to stay in Chat', () => {
    const store = useWorkEscalationStore.getState();
    store.propose('conv-1', {
      objective: 'migrate the docs',
      signal: { type: 'agentic', confidence: 0.9 },
    });
    useWorkEscalationStore.getState().keepInChat('conv-1');
    useWorkEscalationStore.getState().propose('conv-1', {
      objective: 'migrate the docs',
      signal: { type: 'agentic', confidence: 0.9 },
    });

    expect(useWorkEscalationStore.getState().byConversation['conv-1']).toBeUndefined();
    expect(shouldEscalateToWork({ type: 'agentic', confidence: 0.9 }, 'chat', true)).toBe(false);
  });

  it('announces the transition and lets the person override it back to Chat', () => {
    useWorkEscalationStore.getState().propose('conv-1', {
      objective: 'migrate the docs',
      signal: { type: 'agentic', confidence: 0.9 },
    });
    render(<WorkEscalationNotice conversationId="conv-1" />);

    expect(screen.getByRole('status')).toHaveTextContent('Run this as Work?');
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Work' }));
    expect(workMode('conv-1')).toBe('agiwork');
    expect(screen.getByRole('status')).toHaveTextContent('Switched to Work');

    fireEvent.click(screen.getByRole('button', { name: 'Keep this in Chat' }));
    expect(workMode('conv-1')).toBe('chat');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders nothing when no escalation was proposed', () => {
    render(<WorkEscalationNotice conversationId="conv-2" />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
