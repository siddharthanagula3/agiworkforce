import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import { TOOL_APPROVAL_NO_PARAMETERS } from '@agiworkforce/cloud-contracts';
import { getToolDisplayLabel } from '@agiworkforce/types';
import { SYNTHETIC_CLOUD_MODEL_ID } from '@/test-utils/modelFixtures';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: (_target, name) => (name === '__esModule' ? true : icon) });
});

jest.mock('@/src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: () => null,
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

const RUN_ID = '22222222-2222-4222-8222-222222222222';
const SEND_TOOL = 'mcp__gmail__send_email';
const LIST_TOOL = 'mcp__gmail__list_labels';
const SEARCH_TOOL = 'mcp__gmail__search_threads';
const TRUNCATED_PREVIEW = '{"query":"from:ana@example.com subject:quarterly';

const RUN: CloudAgentRun = {
  id: RUN_ID,
  userId: 'user-1',
  requestId: 'request-1',
  conversationId: 'conv-run',
  originSurface: 'mobile',
  workMode: 'agiwork',
  state: 'awaiting_input',
  provider: 'managed',
  model: SYNTHETIC_CLOUD_MODEL_ID,
  lastEventSequence: 9,
  cancellationRequestedAt: null,
  completedAt: null,
  createdAt: '2026-11-15T10:00:00.000Z',
  updatedAt: '2026-11-15T10:01:00.000Z',
  pendingApproval: {
    requestedAt: '2026-11-15T10:01:00.000Z',
    toolCalls: [
      {
        toolCallId: 'call_send',
        name: SEND_TOOL,
        argsPreview: JSON.stringify({ to: 'ana@example.com', subject: 'Quarterly numbers' }),
      },
      { toolCallId: 'call_list', name: LIST_TOOL, argsPreview: '{}' },
      { toolCallId: 'call_search', name: SEARCH_TOOL, argsPreview: TRUNCATED_PREVIEW },
    ],
  },
};

function detail(): CloudRunDetail {
  return {
    runId: RUN_ID,
    run: RUN,
    transcript: '',
    activity: [],
    plan: [],
    files: [],
    status: 'settled',
    error: null,
    pendingAction: null,
  };
}

describe('CloudRunDetailSheet approval', () => {
  it('names each tool in product words and lists its parameters as rows', () => {
    render(
      <CloudRunDetailSheet
        detail={detail()}
        title="Email task"
        onClose={jest.fn()}
        onResolveApproval={jest.fn()}
        onStop={jest.fn()}
        onOpenConversation={jest.fn()}
      />,
    );

    expect(screen.getByText('Waiting for your approval')).toBeTruthy();
    expect(screen.getByText(getToolDisplayLabel(SEND_TOOL).displayName)).toBeTruthy();
    expect(screen.queryByText(SEND_TOOL)).toBeNull();
    expect(screen.getByText('to')).toBeTruthy();
    expect(screen.getByText('ana@example.com')).toBeTruthy();
    expect(screen.getByText('subject')).toBeTruthy();
    expect(screen.getByText('Quarterly numbers')).toBeTruthy();
    expect(screen.queryByText(RUN.pendingApproval!.toolCalls[0]!.argsPreview)).toBeNull();

    expect(screen.getByText(getToolDisplayLabel(LIST_TOOL).displayName)).toBeTruthy();
    expect(screen.getByText(TOOL_APPROVAL_NO_PARAMETERS)).toBeTruthy();

    expect(screen.getByText(getToolDisplayLabel(SEARCH_TOOL).displayName)).toBeTruthy();
    expect(screen.getByText(TRUNCATED_PREVIEW)).toBeTruthy();
  });
});
