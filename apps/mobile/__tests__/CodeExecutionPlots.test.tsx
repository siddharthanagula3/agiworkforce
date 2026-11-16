/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { AgentActivityState, AgentActivityToolEntry } from '@agiworkforce/client-runtime';
import type { Artifact } from '@/types/chat';

const mockViewer = jest.fn();
const mockImageSource = jest.fn((path: string) => ({
  source: path
    ? { uri: `https://api.example.test${path}`, headers: { Authorization: 'Bearer t' } }
    : null,
  status: path ? 'ready' : 'invalid',
}));

jest.mock('@/src/ui/theme', () => {
  const actual = jest.requireActual('@/src/ui/theme/tokens');
  return { ...actual, useThemeColors: () => actual.lightColors };
});
jest.mock('@/components/ui/Text', () => {
  const RN = require('react-native');
  const Text = (props: Record<string, unknown>) => <RN.Text {...props} />;
  Text.displayName = 'Text';
  return { Text };
});
jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) =>
        name === '__esModule'
          ? true
          : (props: Record<string, unknown>) => (
              <RN.View testID={`icon-${String(name)}`} {...props} />
            ),
    },
  );
});
jest.mock('@/components/ui/AgiMark', () => {
  const RN = require('react-native');
  return {
    __esModule: true,
    AgiMark: ({ spinning }: { spinning?: boolean }) => (
      <RN.View testID={spinning ? 'agi-mark-spinning' : 'agi-mark'} />
    ),
  };
});
jest.mock('expo-image', () => {
  const RN = require('react-native');
  return {
    Image: (props: Record<string, unknown>) => <RN.View testID="expo-image" {...props} />,
  };
});
jest.mock('@/src/features/image/hooks/useGeneratedImageSource', () => ({
  useGeneratedImageSource: (path: string) => mockImageSource(path),
}));
jest.mock('@/src/features/chat/components/ImageFullScreen', () => ({
  ImageFullScreen: (props: Record<string, unknown>) => {
    mockViewer(props);
    return null;
  },
}));

import { API_URL } from '@/lib/constants';
import { CodeExecutionBlock } from '@/src/features/chat/components/CodeExecutionBlock';
import { AgentActivityTimeline } from '@/src/features/chat/components/AgentActivityTimeline';
import {
  PLOT_LOAD_FAILED,
  PLOT_SIGN_IN,
  codeExecutionPlotFiles,
  finishedCodeStepId,
  type CodeExecutionPlotFile,
} from '@/src/features/chat/components/CodeExecutionPlots';

const BASE = API_URL.replace(/\/+$/, '');
const PNG_ID = '0b9c2f4e-7a1d-4c3b-9e8f-1a2b3c4d5e6f';
const SECOND_ID = '1c9c2f4e-7a1d-4c3b-9e8f-1a2b3c4d5e70';

function generated(id: string, fileName: string, mimeType: string, uri: string): Artifact {
  return {
    id,
    type: mimeType.startsWith('image/') ? 'image' : 'document',
    title: fileName,
    content: '',
    generatedFile: {
      id,
      computeSessionId: '',
      ownerUserId: '',
      sourceSurface: 'mobile',
      privacyMode: 'managed',
      providerMode: 'ManagedGateway',
      kind: mimeType.startsWith('image/') ? 'image' : 'csv',
      fileName,
      mimeType,
      uri,
      byteCount: 2048,
      checksumSha256: '',
      previewDerivatives: [],
      createdAt: '2026-11-16T00:00:00.000Z',
    },
  } as Artifact;
}

const PNG_PLOT: CodeExecutionPlotFile = {
  artifactId: 'file-png',
  path: `/api/files/${PNG_ID}`,
  name: 'sales.png',
};
const SECOND_PLOT: CodeExecutionPlotFile = {
  artifactId: 'file-trend',
  path: `/api/files/${SECOND_ID}`,
  name: 'trend.png',
};

const RESULT = { stdout: 'saved two charts\n', stderr: '', returnCode: 0 };

function codeStep(overrides: Partial<AgentActivityToolEntry> = {}): AgentActivityToolEntry {
  return {
    kind: 'tool',
    id: 'tool:code-1',
    toolCallId: 'code-1',
    name: 'code_execution',
    summary: 'Run Python',
    status: 'completed',
    input: { code: 'import matplotlib\nplt.savefig("sales.png")' },
    output: 'saved two charts',
    startedAtMs: 1_200,
    ...overrides,
  } as AgentActivityToolEntry;
}

function activity(overrides: Partial<AgentActivityState> = {}): AgentActivityState {
  return {
    schemaVersion: 1,
    sessionId: 'session-1',
    turnId: 'turn-1',
    lastSequence: 3,
    status: 'completed',
    startedAtMs: 1_000,
    updatedAtMs: 2_000,
    completedAtMs: 2_000,
    entries: [codeStep()],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('code execution plots', () => {
  it('keeps only stored png and jpeg files as plots, and leaves svg files as cards', () => {
    const plots = codeExecutionPlotFiles([
      generated('file-png', 'sales.png', 'image/png', `${BASE}/api/files/${PNG_ID}`),
      generated('file-jpg', 'photo.jpg', 'image/jpeg; charset=binary', `/api/files/${SECOND_ID}`),
      generated('file-svg', 'trend.svg', 'image/svg+xml', `/api/files/${SECOND_ID}`),
      generated('file-gif', 'loop.gif', 'image/gif', `/api/files/${PNG_ID}`),
      generated('file-csv', 'sales.csv', 'text/csv', `/api/files/${PNG_ID}`),
      generated('file-remote', 'remote.png', 'image/png', 'https://media.example/remote.png'),
    ]);

    expect(plots).toEqual([
      { artifactId: 'file-png', path: `/api/files/${PNG_ID}`, name: 'sales.png' },
      { artifactId: 'file-jpg', path: `/api/files/${SECOND_ID}`, name: 'photo.jpg' },
    ]);
  });

  it('draws each plot full width under the output, headed Plot 1 and Plot 2', () => {
    const view = render(
      <CodeExecutionBlock messageId="m1" result={RESULT} plots={[PNG_PLOT, SECOND_PLOT]} />,
    );

    expect(view.getByText('Output')).toBeTruthy();
    expect(view.getAllByRole('header').map((header) => header.props.children)).toEqual([
      'Output',
      'Plot 1',
      'Plot 2',
    ]);
    expect(mockImageSource).toHaveBeenCalledWith(PNG_PLOT.path);
    expect(mockImageSource).toHaveBeenCalledWith(SECOND_PLOT.path);
    expect(view.getAllByTestId('code-execution.plot')[0]!.props.style).toEqual(
      expect.objectContaining({ width: '100%' }),
    );
  });

  it('shows a 4:3 grey placeholder until the plot loads, then opens it full screen on a tap', () => {
    const view = render(<CodeExecutionBlock messageId="m1" result={RESULT} plots={[PNG_PLOT]} />);
    const plot = view.getByTestId('code-execution.plot');

    expect(plot.props.style).toEqual(expect.objectContaining({ aspectRatio: 4 / 3 }));
    expect(plot.props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(plot.props.accessibilityLabel).toBe('Plot 1');

    fireEvent(view.getByTestId('expo-image'), 'load', { source: { width: 800, height: 400 } });

    const loaded = view.getByTestId('code-execution.plot');
    expect(loaded.props.style).toEqual(expect.objectContaining({ aspectRatio: 2 }));
    expect(loaded.props.accessibilityState).toEqual({ busy: false, disabled: false });
    fireEvent.press(loaded);
    expect(mockViewer).toHaveBeenLastCalledWith(
      expect.objectContaining({
        imageUrl: PNG_PLOT.path,
        kind: 'attachment',
        name: 'sales.png',
        visible: true,
      }),
    );
  });

  it('says a plot could not be loaded and loads it again on Retry', () => {
    const view = render(<CodeExecutionBlock messageId="m1" result={RESULT} plots={[PNG_PLOT]} />);
    fireEvent(view.getByTestId('expo-image'), 'load', { source: { width: 800, height: 400 } });
    fireEvent(view.getByTestId('expo-image'), 'error', { error: 'HTTP 500' });

    expect(view.getByText(PLOT_LOAD_FAILED)).toBeTruthy();
    expect(view.queryByTestId('code-execution.plot')).toBeNull();
    const asked = mockImageSource.mock.calls.length;
    fireEvent.press(view.getByRole('button', { name: 'Retry Plot 1' }));

    expect(view.queryByText(PLOT_LOAD_FAILED)).toBeNull();
    const retried = view.getByTestId('code-execution.plot');
    expect(retried.props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(retried.props.style).toEqual(expect.objectContaining({ aspectRatio: 4 / 3 }));
    expect(mockImageSource.mock.calls.length).toBeGreaterThan(asked);
  });

  it('asks the person to sign in, with no Retry, when the phone is signed out', () => {
    mockImageSource.mockReturnValueOnce({ source: null, status: 'signed-out' });
    const view = render(<CodeExecutionBlock messageId="m1" result={RESULT} plots={[PNG_PLOT]} />);

    expect(view.getByTestId('code-execution.plot-failed')).toBeTruthy();
    expect(view.getByText(PLOT_SIGN_IN)).toBeTruthy();
    expect(view.queryByText(PLOT_LOAD_FAILED)).toBeNull();
    expect(view.queryByTestId('code-execution.plot-retry')).toBeNull();
  });

  it('offers no Retry for a plot path the phone cannot load', () => {
    mockImageSource.mockReturnValueOnce({ source: null, status: 'invalid' });
    const view = render(<CodeExecutionBlock messageId="m1" result={RESULT} plots={[PNG_PLOT]} />);

    expect(view.getByText(PLOT_LOAD_FAILED)).toBeTruthy();
    expect(view.queryByTestId('code-execution.plot-retry')).toBeNull();
  });

  it('offers Retry when asking for the plot failed', () => {
    mockImageSource.mockReturnValueOnce({ source: null, status: 'error' });
    const view = render(<CodeExecutionBlock messageId="m1" result={RESULT} plots={[PNG_PLOT]} />);

    expect(view.getByText(PLOT_LOAD_FAILED)).toBeTruthy();
    expect(view.getByRole('button', { name: 'Retry Plot 1' })).toBeTruthy();
  });

  it('numbers stored plots after inline images from the same run', () => {
    const view = render(
      <CodeExecutionBlock
        messageId="m1"
        result={{
          ...RESULT,
          images: [{ mediaType: 'image/png', data: 'iVBORw0KGgo=' }],
        }}
        plots={[PNG_PLOT]}
      />,
    );

    expect(view.getByText('Plot 2')).toBeTruthy();
  });

  it('opens a run that printed nothing but plotted a chart', () => {
    const view = render(
      <CodeExecutionBlock
        messageId="m1"
        result={{ stdout: '', stderr: '', returnCode: 0 }}
        plots={[PNG_PLOT]}
      />,
    );

    expect(view.getByText('Plot 1')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Code Execution, Finished' })).toBeTruthy();
  });
});

describe('code execution plots in the activity timeline', () => {
  it('names the last finished code step as the one that plotted', () => {
    expect(
      finishedCodeStepId(
        activity({
          entries: [
            codeStep(),
            codeStep({ id: 'tool:code-2', toolCallId: 'code-2' }),
            codeStep({ id: 'tool:code-3', toolCallId: 'code-3', status: 'running' }),
          ],
        }),
      ),
    ).toBe('tool:code-2');
    expect(
      finishedCodeStepId(activity({ entries: [codeStep({ name: 'web_search' })] })),
    ).toBeUndefined();
    expect(finishedCodeStepId(undefined)).toBeUndefined();
  });

  it('draws the plots under the output of the step that ran the code', () => {
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        activity={activity()}
        defaultExpanded
        codePlots={[PNG_PLOT, SECOND_PLOT]}
      />,
    );
    expect(view.queryByText('Plot 1')).toBeNull();

    fireEvent.press(view.getByLabelText(/^Run Python, /));

    expect(view.getByText('Output')).toBeTruthy();
    expect(view.getByText('Plot 1')).toBeTruthy();
    expect(view.getByText('Plot 2')).toBeTruthy();
    expect(view.getAllByTestId('code-execution.plot')).toHaveLength(2);
  });
});

describe('a run whose status the phone could not learn', () => {
  const unknownRun = activity({
    status: 'running',
    completedAtMs: undefined,
    entries: [
      codeStep({ status: 'running', output: undefined }),
      {
        kind: 'progress',
        id: 'progress:1',
        progressId: 'remote-progress',
        summary: 'Reading the files',
        status: 'running',
        startedAtMs: 1_100,
      } as AgentActivityState['entries'][number],
    ],
  });

  it('shows no spinner and no moving shine, only the muted status', () => {
    const view = render(
      <AgentActivityTimeline
        messageId="m1"
        activity={unknownRun}
        statusLabel="Status unavailable"
        statusUnavailable
        defaultExpanded
      />,
    );

    expect(view.getByTestId('agent-activity.status-unavailable')).toHaveTextContent(
      'Status unavailable',
    );
    expect(view.queryByTestId('agent-activity.running-label')).toBeNull();
    expect(view.queryByTestId('agi-mark-spinning')).toBeNull();
    expect(view.getAllByTestId('icon-CircleHelp')).toHaveLength(2);
    expect(view.getByLabelText('Hide agent activity: Status unavailable')).toBeTruthy();
  });

  it('keeps the shine and the spinner while the answer is really being written', () => {
    const view = render(
      <AgentActivityTimeline messageId="m1" activity={unknownRun} nowMs={2_500} defaultExpanded />,
    );

    expect(view.getByTestId('agent-activity.running-label')).toBeTruthy();
    expect(view.queryByTestId('agent-activity.status-unavailable')).toBeNull();
    expect(view.getAllByTestId('agi-mark-spinning')).toHaveLength(2);
    expect(view.queryByTestId('icon-CircleHelp')).toBeNull();
  });
});
