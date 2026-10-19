const mockFetchConnectorDirectory = jest.fn();
jest.mock('@/services/connectors', () => ({
  fetchConnectorDirectory: () => mockFetchConnectorDirectory(),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';

import type { StreamDelta } from '@/services/streaming';
import {
  reduceResearchDelta,
  settleResearchRun,
  type ResearchRunState,
} from '@/src/features/chat/utils/researchRunState';
import { defaultResearchPlanChoices } from '@/src/features/chat/utils/researchPlanChoices';
import { ResearchRunCard } from '../ResearchRunCard';

const RUN: StreamDelta[] = [
  {
    x_research_status: {
      phase: 'planning',
      label: 'Planning research',
      iteration: 1,
      max_iterations: 6,
      searches: 0,
      max_searches: 12,
      sources: 0,
      elapsed_ms: 900,
    },
  },
  {
    x_research_plan: {
      steps: [
        {
          id: 'step-1',
          type: 'search',
          description: 'Battery chemistry roadmaps 2026',
          status: 'pending',
        },
        {
          id: 'step-2',
          type: 'search',
          description: 'Sodium-ion cost per kilowatt hour',
          status: 'pending',
        },
      ],
    },
  },
  {
    x_research_status: {
      phase: 'awaiting_approval',
      label: 'Review the plan to start searching',
      iteration: 1,
      max_iterations: 6,
      searches: 0,
      max_searches: 12,
      sources: 0,
      elapsed_ms: 1400,
    },
  },
] as StreamDelta[];

const PROGRESS: StreamDelta[] = [
  {
    x_research_plan: {
      steps: [
        {
          id: 'step-1',
          type: 'search',
          description: 'Battery chemistry roadmaps 2026',
          status: 'completed',
          duration_ms: 4200,
          sources_consulted: 4,
        },
        {
          id: 'step-2',
          type: 'search',
          description: 'Sodium-ion cost per kilowatt hour',
          status: 'running',
        },
      ],
    },
  },
  {
    x_search_results: {
      content: [
        { type: 'web_search_result', url: 'https://one.example/a', title: 'Roadmap' },
        { type: 'web_search_result', url: 'https://two.example/b', title: 'Cost curve' },
      ],
    },
  },
  {
    x_research_status: {
      phase: 'searching',
      label: 'Searching the web',
      iteration: 2,
      max_iterations: 6,
      searches: 3,
      max_searches: 12,
      sources: 2,
      elapsed_ms: 18_000,
    },
  },
] as StreamDelta[];

const REPORT: StreamDelta[] = [
  {
    x_research_status: {
      phase: 'complete',
      label: 'Research complete',
      iteration: 4,
      max_iterations: 6,
      searches: 6,
      max_searches: 12,
      sources: 9,
      elapsed_ms: 71_000,
    },
  },
] as StreamDelta[];

function replay(deltas: StreamDelta[], seed?: ResearchRunState): ResearchRunState {
  let state = seed;
  for (const delta of deltas) {
    const next = reduceResearchDelta(state, delta, '2026-09-13T00:00:00.000Z');
    if (next) state = next;
  }
  if (!state) throw new Error('fixture produced no research state');
  return state;
}

beforeEach(() => {
  mockFetchConnectorDirectory.mockResolvedValue({
    connectors: [],
    available: [],
    entries: [],
    policy: null,
  });
});

describe('ResearchRunCard over a recorded run', () => {
  it('lets the run read a connected app the user picks', async () => {
    mockFetchConnectorDirectory.mockResolvedValue({
      connectors: [
        {
          id: 'conn-1',
          connectorId: 'gmail',
          toolConnectorId: 'gmail',
          authType: 'oauth',
          connectedAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          source: 'oauth',
        },
        {
          id: 'conn-2',
          connectorId: 'slack',
          authType: 'oauth',
          connectedAt: '2026-10-01T00:00:00.000Z',
          updatedAt: '2026-10-01T00:00:00.000Z',
          source: 'oauth',
          needsReauthorization: true,
        },
      ],
      available: [],
      entries: [],
      policy: null,
    });
    const onPlanDecision = jest.fn();
    render(
      <ResearchRunCard
        research={replay(RUN)}
        isStreaming={false}
        onPlanDecision={onPlanDecision}
      />,
    );

    fireEvent.press(await screen.findByLabelText('Gmail'));
    expect(screen.queryByLabelText('Slack')).toBeNull();
    fireEvent.press(screen.getByTestId('research-plan-approve'));
    expect(onPlanDecision).toHaveBeenCalledWith({
      choices: expect.objectContaining({
        sources: expect.objectContaining({ connectors: ['gmail'] }),
      }),
    });
  });

  it('starts the run with the deliverable and sources chosen on the plan', () => {
    const onPlanDecision = jest.fn();
    render(
      <ResearchRunCard
        research={replay(RUN)}
        isStreaming={false}
        onPlanDecision={onPlanDecision}
      />,
    );

    expect(screen.getByText('Searching the whole web. Add a source to narrow it.')).toBeTruthy();
    fireEvent.press(screen.getByTestId('research-deliverable-executive-summary'));
    fireEvent.press(screen.getByTestId('research-format-bullet-brief'));
    fireEvent(screen.getByTestId('research-source-files'), 'valueChange', true);
    fireEvent.changeText(
      screen.getByTestId('research-source-allow'),
      'https://www.iea.org/reports, nature.com',
    );
    fireEvent(screen.getByTestId('research-source-allow'), 'submitEditing');
    fireEvent.changeText(screen.getByTestId('research-source-deny'), 'example-blog.com');
    fireEvent(screen.getByTestId('research-source-deny'), 'submitEditing');
    expect(screen.getByText('Never example-blog.com')).toBeTruthy();

    fireEvent.press(screen.getByTestId('research-plan-approve'));
    expect(onPlanDecision).toHaveBeenCalledWith({
      choices: {
        deliverable: expect.objectContaining({
          depth: 'executive-summary',
          format: 'bullet-brief',
        }),
        sources: {
          files: true,
          allowDomains: ['iea.org', 'nature.com'],
          denyDomains: ['example-blog.com'],
          connectors: [],
        },
      },
    });
  });

  it('refuses a source that is not a site address', () => {
    render(
      <ResearchRunCard research={replay(RUN)} isStreaming={false} onPlanDecision={jest.fn()} />,
    );
    fireEvent.changeText(screen.getByTestId('research-source-allow'), 'not a site');
    fireEvent(screen.getByTestId('research-source-allow'), 'submitEditing');
    expect(screen.getByText('Enter site addresses such as example.com.')).toBeTruthy();
  });

  it('offers approve and cancel on the paused plan', () => {
    const onPlanDecision = jest.fn();
    render(
      <ResearchRunCard
        research={replay(RUN)}
        isStreaming={false}
        onPlanDecision={onPlanDecision}
      />,
    );

    expect(screen.getByText('Review the plan to start searching')).toBeTruthy();
    expect(screen.getByDisplayValue('Battery chemistry roadmaps 2026')).toBeTruthy();
    expect(screen.getByDisplayValue('Sodium-ion cost per kilowatt hour')).toBeTruthy();

    fireEvent.press(screen.getByTestId('research-plan-approve'));
    expect(onPlanDecision).toHaveBeenCalledWith({ choices: defaultResearchPlanChoices() });
    fireEvent.press(screen.getByTestId('research-plan-cancel'));
    expect(onPlanDecision).toHaveBeenCalledWith('cancel');
  });

  it('hides approve while a resume is in flight and while the turn streams', () => {
    const { rerender } = render(
      <ResearchRunCard
        research={replay(RUN)}
        isStreaming={false}
        isResuming
        onPlanDecision={jest.fn()}
      />,
    );
    expect(screen.getByText('Starting…')).toBeTruthy();

    rerender(<ResearchRunCard research={replay(RUN)} isStreaming onPlanDecision={jest.fn()} />);
    expect(screen.queryByTestId('research-plan-approve')).toBeNull();
  });

  it('shows live counts and a stop action while searching', () => {
    const onStop = jest.fn();
    const research = replay(PROGRESS, replay(RUN));
    render(<ResearchRunCard research={research} isStreaming onStop={onStop} />);

    expect(screen.getByText('Searching the web')).toBeTruthy();
    expect(screen.getByTestId('research-run-counts').props.children).toBe(
      'round 2 of 6 · 3 of 12 searches · 2 sources',
    );
    fireEvent.press(screen.getByTestId('research-run-stop'));
    expect(onStop).toHaveBeenCalled();
  });

  it('reports the finished run without offering plan actions', () => {
    const research = replay(REPORT, replay(PROGRESS, replay(RUN)));
    render(
      <ResearchRunCard
        research={research}
        isStreaming={false}
        onPlanDecision={jest.fn()}
        onRetry={jest.fn()}
        onStop={jest.fn()}
      />,
    );

    expect(screen.getByText('Research complete')).toBeTruthy();
    expect(screen.getByTestId('research-run-counts').props.children).toBe('6 searches · 9 sources');
    expect(screen.queryByTestId('research-plan-approve')).toBeNull();
    expect(screen.queryByTestId('research-run-retry')).toBeNull();
    expect(screen.queryByTestId('research-run-stop')).toBeNull();
  });

  it('offers retry with the failure reason after a failed run', () => {
    const onRetry = jest.fn();
    const failed = replay(
      [
        {
          x_research_status: { phase: 'error', label: 'Research provider unavailable' },
        } as StreamDelta,
      ],
      replay(PROGRESS, replay(RUN)),
    );
    render(<ResearchRunCard research={failed} isStreaming={false} onRetry={onRetry} />);

    expect(screen.getByText('Research provider unavailable')).toBeTruthy();
    fireEvent.press(screen.getByTestId('research-run-retry'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('prints a failure reason the phase label does not already carry', () => {
    const failed = settleResearchRun(
      replay(PROGRESS, replay(RUN)),
      'error',
      'Failed to connect. Check your network and try again.',
    );
    render(<ResearchRunCard research={failed!} isStreaming={false} />);

    expect(screen.getByText('Research failed')).toBeTruthy();
    expect(screen.getByText('Failed to connect. Check your network and try again.')).toBeTruthy();
  });

  it('says a stopped run stopped and still offers retry', () => {
    const stopped = settleResearchRun(replay(PROGRESS, replay(RUN)), 'interrupted');
    render(<ResearchRunCard research={stopped!} isStreaming={false} onRetry={jest.fn()} />);

    expect(screen.getByText('Research stopped')).toBeTruthy();
    expect(screen.getByText('Stopped before it finished.')).toBeTruthy();
    expect(screen.getByTestId('research-run-retry')).toBeTruthy();
  });

  it('says a cancelled plan was cancelled', () => {
    const cancelled: ResearchRunState = {
      ...replay(RUN),
      phase: 'interrupted',
      label: 'Research plan cancelled',
    };
    render(<ResearchRunCard research={cancelled} isStreaming={false} />);

    expect(screen.getByText('Research plan cancelled')).toBeTruthy();
    expect(screen.queryByTestId('research-plan-approve')).toBeNull();
  });
});
