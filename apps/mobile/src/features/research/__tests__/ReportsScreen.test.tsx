import React from 'react';
import { FlatList } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockFetchResearchReports = jest.fn();

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

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return { AlertCircle: icon, ArrowLeft: icon, Telescope: icon, TriangleAlert: icon };
});

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

jest.mock('../service', () => ({
  ...jest.requireActual('../service'),
  fetchResearchReports: (...args: unknown[]) => mockFetchResearchReports(...args),
}));

import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { ReportsScreen } from '../ReportsScreen';
import { RESEARCH_REPORTS_LIMIT } from '../service';

function reports(from: number, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `report-${from + index}`,
    requestId: `request-${from + index}`,
    title: `Report ${from + index}`,
    query: `Question ${from + index}`,
    summary: '',
    content: '',
    citations: [],
    steps: [],
    keyFindings: [],
    status: 'completed',
    sourcesConsulted: 0,
    createdAt: '2026-11-01T00:00:00.000Z',
  }));
}

describe('Reports list paging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ isClerkSignedIn: true });
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('reads the next page of older reports when the list reaches its end', async () => {
    mockFetchResearchReports
      .mockResolvedValueOnce(reports(0, RESEARCH_REPORTS_LIMIT))
      .mockResolvedValueOnce(reports(RESEARCH_REPORTS_LIMIT, 3));
    const { findByText, UNSAFE_getByType } = render(<ReportsScreen />);

    await findByText('Report 0');
    expect(UNSAFE_getByType(FlatList).props.data).toHaveLength(RESEARCH_REPORTS_LIMIT);
    fireEvent(UNSAFE_getByType(FlatList), 'endReached');

    await waitFor(() =>
      expect(mockFetchResearchReports).toHaveBeenLastCalledWith({
        offset: RESEARCH_REPORTS_LIMIT,
      }),
    );
    await waitFor(() =>
      expect(UNSAFE_getByType(FlatList).props.data).toHaveLength(RESEARCH_REPORTS_LIMIT + 3),
    );
  });

  it('stops asking for more once a page comes back short', async () => {
    mockFetchResearchReports.mockResolvedValueOnce(reports(0, 3));
    const { findByText, UNSAFE_getByType } = render(<ReportsScreen />);

    await findByText('Report 0');
    fireEvent(UNSAFE_getByType(FlatList), 'endReached');

    expect(mockFetchResearchReports).toHaveBeenCalledTimes(1);
  });

  it('says older reports could not be loaded and retries on request', async () => {
    mockFetchResearchReports
      .mockResolvedValueOnce(reports(0, RESEARCH_REPORTS_LIMIT))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(reports(RESEARCH_REPORTS_LIMIT, 1));
    const { findByText, findByLabelText, UNSAFE_getByType } = render(<ReportsScreen />);

    await findByText('Report 0');
    fireEvent(UNSAFE_getByType(FlatList), 'endReached');

    expect(await findByText('Could not load older reports.')).toBeTruthy();
    fireEvent.press(await findByLabelText('Try loading older reports again'));

    await waitFor(() => expect(mockFetchResearchReports).toHaveBeenCalledTimes(3));
  });
});
