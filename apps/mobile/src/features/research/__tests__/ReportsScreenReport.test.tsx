import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import {
  actionMenuLabels,
  cancelActionMenu,
  chooseActionMenuItem,
  isActionMenuOpen,
} from '@/test-utils/actionMenu';

const mockFetchResearchReports = jest.fn();
const mockReportSheet = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: () => jest.fn().mockReturnValue(null) }),
);

jest.mock('@clerk/expo', () => ({
  getClerkInstance: () => null,
}));

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((callback: () => void) => callback()),
  rehydrateWhenMmkvReady: jest.fn(),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
  storage: {
    getString: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/src/features/chat/components/research/ResearchSourcesAppendix', () => ({
  ResearchSourcesAppendix: () => null,
}));
jest.mock('@/src/features/chat/components/MessageContentRenderer', () => ({
  renderMarkdownContent: () => null,
}));
jest.mock('@/src/features/chat/components/ReportFlagButton', () => ({
  ReportSheet: (props: Record<string, unknown>) => {
    mockReportSheet(props);
    return null;
  },
}));

jest.mock('../service', () => ({
  ...jest.requireActual('../service'),
  fetchResearchReports: (...args: unknown[]) => mockFetchResearchReports(...args),
}));

import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { ReportsScreen } from '../ReportsScreen';

const REPORT = {
  id: '6f1c2a40-0d3b-4c55-9a51-1f2e3d4c5b6a',
  requestId: 'request-1',
  title: 'Battery recycling in 2026',
  query: 'How is battery recycling changing?',
  summary: 'Recovery rates rose across the sector.',
  content: '## Findings\n\nRecovery rates rose.',
  citations: [],
  steps: [],
  keyFindings: [],
  status: 'completed',
  sourcesConsulted: 4,
  createdAt: '2026-11-01T00:00:00.000Z',
};

function pressReportInMoreMenu(screen: ReturnType<typeof render>) {
  fireEvent.press(screen.getByLabelText('More report actions'));
  expect(actionMenuLabels()).toContain('Report this research report');
  chooseActionMenuItem('Report this research report');
}

async function openDetail(report: Record<string, unknown>) {
  mockFetchResearchReports.mockResolvedValueOnce({ reports: [report], nextCursor: null });
  const screen = render(<ReportsScreen />);
  fireEvent.press(await screen.findByTestId('research-report-row'));
  return screen;
}

describe('reporting a research report', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ isClerkSignedIn: true });
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('offers Report on the report and opens the report sheet only when asked', async () => {
    const screen = await openDetail({ ...REPORT, conversationId: 'conv-42' });

    expect(mockReportSheet).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Report this research report')).toBeNull();
    pressReportInMoreMenu(screen);

    await waitFor(() =>
      expect(mockReportSheet).toHaveBeenLastCalledWith(
        expect.objectContaining({
          visible: true,
          title: 'Report this research report',
          target: {
            messageId: `research-report:${REPORT.id}`,
            conversationId: 'conv-42',
            subject: { kind: 'research-report', id: REPORT.id },
            contentExcerpt: expect.stringContaining('Battery recycling in 2026'),
          },
        }),
      ),
    );
    const { target } = mockReportSheet.mock.calls.at(-1)?.[0] as {
      target: { contentExcerpt: string };
    };
    expect(target.contentExcerpt).toContain('Recovery rates rose across the sector.');
  });

  it('names the report itself when it was not made in a chat', async () => {
    const screen = await openDetail(REPORT);
    pressReportInMoreMenu(screen);

    await waitFor(() =>
      expect(mockReportSheet).toHaveBeenLastCalledWith(
        expect.objectContaining({
          target: expect.objectContaining({
            messageId: `research-report:${REPORT.id}`,
            conversationId: `research-report:${REPORT.id}`,
          }),
        }),
      ),
    );
  });

  it('closes the sheet through its own close callback', async () => {
    const screen = await openDetail(REPORT);
    pressReportInMoreMenu(screen);
    await waitFor(() => expect(mockReportSheet).toHaveBeenCalled());

    const { onClose } = mockReportSheet.mock.calls.at(-1)?.[0] as { onClose: () => void };
    mockReportSheet.mockClear();
    React.act(() => onClose());

    expect(mockReportSheet).not.toHaveBeenCalled();
    expect(screen.getByTestId('research-report-detail')).toBeTruthy();
  });
});

describe('reporting a research report on Android', () => {
  let platform: jest.ReplaceProperty<typeof Platform.OS>;
  let alert: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    platform = jest.replaceProperty(Platform, 'OS', 'android');
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    useAuthStore.setState({ isClerkSignedIn: true });
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  afterEach(() => {
    alert.mockRestore();
    platform.restore();
    jest.useRealTimers();
  });

  it('reaches Report from the More sheet, where Cancel also closes it', async () => {
    const screen = await openDetail({ ...REPORT, conversationId: 'conv-42' });

    fireEvent.press(screen.getByLabelText('More report actions'));
    expect(alert).not.toHaveBeenCalled();
    expect(actionMenuLabels().at(-1)).toBe('Report this research report');
    cancelActionMenu();
    expect(isActionMenuOpen()).toBe(false);
    expect(mockReportSheet).not.toHaveBeenCalledWith(expect.objectContaining({ visible: true }));

    pressReportInMoreMenu(screen);
    await waitFor(() =>
      expect(mockReportSheet).toHaveBeenLastCalledWith(
        expect.objectContaining({
          visible: true,
          target: expect.objectContaining({ conversationId: 'conv-42' }),
        }),
      ),
    );
  });
});
