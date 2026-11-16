import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockFetchResearchReports = jest.fn();
const mockPreviewCitation = jest.fn();
const mockRenderMarkdownContent = jest.fn();

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
  renderMarkdownContent: (...args: unknown[]) => {
    mockRenderMarkdownContent(...args);
    return null;
  },
}));
jest.mock('@/src/features/chat/components/CitationChip', () => ({
  ...jest.requireActual('@/src/features/chat/components/CitationChip'),
  previewCitation: (...args: unknown[]) => mockPreviewCitation(...args),
}));

jest.mock('../service', () => ({
  ...jest.requireActual('../service'),
  fetchResearchReports: (...args: unknown[]) => mockFetchResearchReports(...args),
}));

import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { ReportsScreen } from '../ReportsScreen';

const CITATIONS = [
  {
    id: '1',
    title: 'Recycling outlook',
    url: 'https://energy.example/outlook',
    accessedAt: '2026-11-01T00:00:00.000Z',
  },
  {
    id: '2',
    title: 'Plant capacity survey',
    url: 'https://survey.example/plants',
    accessedAt: '2026-11-01T00:00:00.000Z',
  },
];

const REPORT = {
  id: '6f1c2a40-0d3b-4c55-9a51-1f2e3d4c5b6a',
  requestId: 'request-1',
  title: 'Battery recycling in 2026',
  query: 'How is battery recycling changing?',
  summary: 'Recovery rates rose across the sector [1].',
  content: '## Findings\n\nRecovery rates rose [1][2].',
  citations: CITATIONS,
  steps: [],
  keyFindings: ['New plants doubled capacity [2].'],
  status: 'completed',
  sourcesConsulted: 2,
  createdAt: '2026-11-01T00:00:00.000Z',
};

async function openDetail() {
  mockFetchResearchReports.mockResolvedValueOnce({ reports: [REPORT], nextCursor: null });
  const screen = render(<ReportsScreen />);
  fireEvent.press(await screen.findByTestId('research-report-row'));
  return screen;
}

describe('citation markers in a research report', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ isClerkSignedIn: true });
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('turns a marker in the summary into a control that opens that source', async () => {
    const screen = await openDetail();

    expect(screen.queryByText(/\[1\]/)).toBeNull();
    fireEvent.press(screen.getByLabelText('Citation 1: Recycling outlook'));

    expect(mockPreviewCitation).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://energy.example/outlook',
        title: 'Recycling outlook',
      }),
    );
  });

  it('turns a marker in a key finding into a control for its own source', async () => {
    const screen = await openDetail();

    expect(screen.queryByText(/\[2\]/)).toBeNull();
    fireEvent.press(screen.getByLabelText('Citation 2: Plant capacity survey'));

    expect(mockPreviewCitation).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://survey.example/plants' }),
    );
  });

  it('gives the report body the same numbered sources', async () => {
    await openDetail();

    const [content, , options] = mockRenderMarkdownContent.mock.calls.at(-1) ?? [];
    expect(content).toBe(REPORT.content);
    expect((options as { citations: { url: string }[] }).citations.map((c) => c.url)).toEqual([
      'https://energy.example/outlook',
      'https://survey.example/plants',
    ]);
  });
});
