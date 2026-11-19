import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import { SYNTHETIC_CLOUD_MODEL_ID } from '@/test-utils/modelFixtures';

const mockReportSheet = jest.fn();

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

jest.mock('@/src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: (props: Record<string, unknown>) => {
    mockReportSheet(props);
    return null;
  },
}));

jest.mock('../store', () => ({
  useCloudTaskStore: (selector: (state: { answerInput: () => void }) => unknown) =>
    selector({ answerInput: jest.fn() }),
}));

jest.mock('../components/CloudRunSteerSection', () => ({ CloudRunSteerSection: () => null }));
jest.mock('../components/CloudRunInputForm', () => ({ CloudRunInputForm: () => null }));
jest.mock('../components/CloudRunFilesSection', () => ({ CloudRunFilesSection: () => null }));

import { CloudRunDetailSheet } from '../components/CloudRunDetailSheet';
import type { CloudRunDetail } from '../store';

const RUN_ID = '11111111-1111-4111-8111-111111111111';

const RUN: CloudAgentRun = {
  id: RUN_ID,
  userId: 'user-1',
  requestId: 'request-1',
  conversationId: 'conv-run',
  originSurface: 'mobile',
  workMode: 'research',
  state: 'completed',
  provider: 'managed',
  model: SYNTHETIC_CLOUD_MODEL_ID,
  lastEventSequence: 4,
  cancellationRequestedAt: null,
  completedAt: '2026-11-14T11:00:00.000Z',
  createdAt: '2026-11-14T10:00:00.000Z',
  updatedAt: '2026-11-14T11:00:00.000Z',
};

function detail(overrides: Partial<CloudRunDetail> = {}): CloudRunDetail {
  return {
    runId: RUN_ID,
    run: RUN,
    transcript: 'The summary the agent wrote.',
    activity: [],
    plan: [{ ordinal: 1, description: 'Read the sources', status: 'completed' }],
    files: [],
    status: 'settled',
    error: null,
    pendingAction: null,
    ...overrides,
  };
}

function renderSheet(value: CloudRunDetail) {
  return render(
    <CloudRunDetailSheet
      detail={value}
      title="Research task"
      onClose={jest.fn()}
      onResolveApproval={jest.fn()}
      onStop={jest.fn()}
      onOpenConversation={jest.fn()}
    />,
  );
}

describe('reporting what a cloud task produced', () => {
  beforeEach(() => mockReportSheet.mockClear());

  it('opens the report sheet with the latest output and the plan the agent wrote', () => {
    const screen = renderSheet(detail());
    expect(mockReportSheet).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Report this task'));

    expect(mockReportSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        title: 'Report this task',
        target: {
          messageId: `cloud-run:${RUN_ID}`,
          conversationId: 'conv-run',
          contentExcerpt: 'The summary the agent wrote.\n\nRead the sources',
          subject: { kind: 'task-run', id: RUN_ID },
        },
      }),
    );
  });

  it('names the run as its conversation when the task has none', () => {
    const screen = renderSheet(detail({ run: { ...RUN, conversationId: null } }));

    fireEvent.press(screen.getByLabelText('Report this task'));

    expect(mockReportSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ conversationId: `cloud-run:${RUN_ID}` }),
      }),
    );
  });

  it('offers no report before the task has produced anything', () => {
    const screen = renderSheet(detail({ transcript: '', plan: [] }));

    expect(screen.queryByLabelText('Report this task')).toBeNull();
  });
});
