import React from 'react';
import { render } from '@testing-library/react-native';

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

jest.mock('../service', () => ({
  ...jest.requireActual('../service'),
  fetchResearchReports: (...args: unknown[]) => mockFetchResearchReports(...args),
}));

import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { getShortDisplayName } from '@/src/features/model-picker/service';
import { requireMobileCloudModel } from '@/test-utils/modelFixtures';
import { ReportsScreen } from '../ReportsScreen';

const CLOUD_MODEL_ID = requireMobileCloudModel().id;

function report(id: string, model: string | undefined) {
  return {
    id,
    requestId: `request-${id}`,
    title: `Report ${id}`,
    query: `Question ${id}`,
    summary: '',
    content: '',
    citations: [],
    steps: [],
    keyFindings: [],
    status: 'completed',
    sourcesConsulted: 24,
    createdAt: '2026-11-15T10:00:00.000Z',
    ...(model === undefined ? {} : { model }),
  };
}

describe('Reports list model name', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ isClerkSignedIn: true });
    useChatAppModeStore.setState({ appMode: 'cloud' });
  });

  it('shows the catalog name of the model that wrote the report, not its id', async () => {
    mockFetchResearchReports.mockResolvedValueOnce({
      reports: [report('known', CLOUD_MODEL_ID)],
      nextCursor: null,
    });
    const { findByTestId } = render(<ReportsScreen />);

    const row = await findByTestId('research-report-row');
    const name = getShortDisplayName(CLOUD_MODEL_ID);
    expect(name).not.toBe(CLOUD_MODEL_ID);
    expect(row.props.accessibilityLabel).toContain(`24 sources · ${name}`);
    expect(row.props.accessibilityLabel).not.toContain(CLOUD_MODEL_ID);
  });

  it('leaves the model out when the catalog no longer knows the id', async () => {
    mockFetchResearchReports.mockResolvedValueOnce({
      reports: [report('retired', 'retired-model-slug-0')],
      nextCursor: null,
    });
    const { findByTestId } = render(<ReportsScreen />);

    const row = await findByTestId('research-report-row');
    expect(row.props.accessibilityLabel).toContain('24 sources');
    expect(row.props.accessibilityLabel).not.toContain('retired-model-slug-0');
    expect(row.props.accessibilityLabel).not.toContain('Not set');
  });
});
