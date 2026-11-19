import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Share } from 'react-native';
import { actionMenuLabels, chooseActionMenuItem } from '@/test-utils/actionMenu';

const mockFetchResearchReports = jest.fn();
const mockExportSheet = jest.fn();
const mockSaveArtifactToLibrary = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    back: jest.fn(),
    replace: jest.fn(),
    push: mockPush,
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
jest.mock('@/src/features/chat/components/ArtifactExportSheet', () => ({
  ArtifactExportSheet: (props: Record<string, unknown>) => {
    mockExportSheet(props);
    return null;
  },
}));
jest.mock('@/src/features/artifacts/libraryService', () => ({
  saveArtifactToLibrary: (...args: unknown[]) => mockSaveArtifactToLibrary(...args),
}));

jest.mock('../service', () => ({
  ...jest.requireActual('../service'),
  fetchResearchReports: (...args: unknown[]) => mockFetchResearchReports(...args),
}));

import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  __resetCloudAccountSessionForTests,
  activateCloudAccount,
} from '@/src/features/auth/services/cloudAccountSession';
import { ReportsScreen } from '../ReportsScreen';
import { useComposerPrefillStore } from '@/src/features/chat/store/composerPrefillStore';
import { researchReportFollowUpPrompt } from '@agiworkforce/unified-chat/research-report';

const REPORT = {
  id: '6f1c2a40-0d3b-4c55-9a51-1f2e3d4c5b6a',
  requestId: 'request-1',
  title: 'Battery recycling in 2026',
  query: 'How is battery recycling changing?',
  summary: 'Recovery rates rose.',
  content: '## Findings\n\nRecovery rates rose [1].\n',
  citations: [],
  steps: [],
  keyFindings: [],
  status: 'completed',
  sourcesConsulted: 2,
  createdAt: '2026-11-01T00:00:00.000Z',
};

const REPORT_MARKDOWN =
  '# Battery recycling in 2026\n\nRecovery rates rose.\n\n## Findings\n\nRecovery rates rose [1].';

async function openMenu() {
  mockFetchResearchReports.mockResolvedValueOnce({ reports: [REPORT], nextCursor: null });
  const screen = render(<ReportsScreen />);
  fireEvent.press(await screen.findByTestId('research-report-row'));
  fireEvent.press(screen.getByLabelText('More report actions'));
  return { screen, buttons: actionMenuLabels() };
}

function press(buttons: string[], text: string) {
  expect(buttons).toContain(text);
  chooseActionMenuItem(text);
}

let alert: jest.SpyInstance;

describe('keeping a research report', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({ isClerkSignedIn: true });
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  afterEach(() => alert.mockRestore());

  it('offers Download, Share, Save to Library and Report in the More menu', async () => {
    const { screen, buttons } = await openMenu();
    expect(buttons).toEqual([
      'Download',
      'Share',
      'Save to Library',
      'Report this research report',
    ]);
    expect(screen.getByTestId('conversation-action-cancel')).toBeTruthy();
  });

  it('downloads the report with its title, summary and body through the export sheet', async () => {
    const { buttons } = await openMenu();
    expect(mockExportSheet).toHaveBeenLastCalledWith(expect.objectContaining({ visible: false }));

    press(buttons, 'Download');

    expect(mockExportSheet).toHaveBeenLastCalledWith(
      expect.objectContaining({
        visible: true,
        content: REPORT_MARKDOWN,
        artifact: { type: 'research', title: 'Battery recycling in 2026' },
      }),
    );
  });

  it('shares the whole report as one document', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const { buttons } = await openMenu();

    press(buttons, 'Share');

    expect(share).toHaveBeenCalledWith({
      title: 'Battery recycling in 2026',
      message: REPORT_MARKDOWN,
    });
  });

  it('saves the report to the Library for the signed-in account and says so', async () => {
    mockSaveArtifactToLibrary.mockResolvedValue('library-item-1');
    const { buttons } = await openMenu();

    press(buttons, 'Save to Library');

    await waitFor(() =>
      expect(alert).toHaveBeenLastCalledWith(
        'Saved to Library',
        '“Battery recycling in 2026” is in your Library.',
      ),
    );
    expect(mockSaveArtifactToLibrary).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Battery recycling in 2026',
        kind: 'research',
        content: REPORT_MARKDOWN,
        provenance: { scope: 'cloud', ownerId: 'user-1' },
      }),
    );
  });

  it('says when the Library did not take the report', async () => {
    mockSaveArtifactToLibrary.mockRejectedValue(new Error('offline'));
    const { buttons } = await openMenu();

    press(buttons, 'Save to Library');

    await waitFor(() =>
      expect(alert).toHaveBeenLastCalledWith('Could not save to Library', 'Try again.'),
    );
  });
});

describe('asking a follow-up about a research report', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    __resetCloudAccountSessionForTests();
    activateCloudAccount('user-1');
    useAuthStore.setState({ isClerkSignedIn: true });
    useChatAppModeStore.setState({ appMode: 'cloud' });
    useComposerPrefillStore.setState({ pending: {} });
  });

  afterEach(() => alert.mockRestore());

  async function openReport(report: typeof REPORT & { conversationId?: string }) {
    mockFetchResearchReports.mockResolvedValueOnce({ reports: [report], nextCursor: null });
    const screen = render(<ReportsScreen />);
    fireEvent.press(await screen.findByTestId('research-report-row'));
    return screen;
  }

  it("opens the report's chat with the question grounded in the report", async () => {
    const report = { ...REPORT, conversationId: 'conv-report-1' };
    const screen = await openReport(report);
    const send = screen.getByTestId('research-report-follow-up-send');
    expect(send.props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(send);
    expect(mockPush).not.toHaveBeenCalled();

    fireEvent.changeText(
      screen.getByTestId('research-report-follow-up-input'),
      '  What about Europe?  ',
    );
    fireEvent.press(screen.getByTestId('research-report-follow-up-send'));

    const prompt = useComposerPrefillStore.getState().pending['conv-report-1'];
    expect(prompt).toBe(researchReportFollowUpPrompt(report, 'What about Europe?'));
    expect(prompt).toContain(`<research_report>\n\n${REPORT_MARKDOWN}\n\n</research_report>`);
    expect(prompt?.endsWith('What about Europe?')).toBe(true);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/(app)/chat/[id]',
      params: { id: 'conv-report-1' },
    });
    expect(screen.getByTestId('research-report-follow-up-input').props.value).toBe('');
  });

  it('offers no follow-up for a report without a chat', async () => {
    const screen = await openReport(REPORT);
    expect(screen.queryByTestId('research-report-follow-up')).toBeNull();
  });
});
