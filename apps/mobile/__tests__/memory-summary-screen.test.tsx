/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    navigate: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return { ArrowLeft: Icon, Brain: Icon, ChevronRight: Icon, CloudOff: Icon };
});

jest.mock('@/lib/mmkv', () => ({
  whenMmkvReady: jest.fn((cb) => cb()),
  rehydrateWhenMmkvReady: jest.fn((store, _name) => {
    if (store?.persist?.rehydrate) store.persist.rehydrate();
  }),
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const mockEntries: Array<{
  id: string;
  fact: string;
  source_conversation_id: string | null;
  pinned: boolean;
  created_at: number;
}> = [];
const mockFetchMemories = jest.fn(async () => undefined);

jest.mock('../src/features/memory/store', () => ({
  useMemoryStore: (
    selector: (state: {
      entries: unknown[];
      loading: boolean;
      fetchMemories: () => Promise<void>;
    }) => unknown,
  ) => selector({ entries: mockEntries, loading: false, fetchMemories: mockFetchMemories }),
}));

import MemorySummaryScreen from '../app/(app)/settings/memory-summary';
import { useChatAppModeStore } from '../src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '../stores/settings/localSettingsStore';

describe('Memory summary screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEntries.length = 0;
    useChatAppModeStore.setState({ appMode: 'local' });
    useLocalSettingsStore.setState({ memoryEnabled: true });
  });

  it('renders stored facts verbatim under their derived group', () => {
    mockEntries.push(
      {
        id: '1',
        fact: 'prefers rust over python',
        source_conversation_id: 'conv-1',
        pinned: false,
        created_at: Date.now(),
      },
      {
        id: '2',
        fact: 'allergic to peanuts',
        source_conversation_id: null,
        pinned: true,
        created_at: Date.now(),
      },
    );

    const { getByText } = render(<MemorySummaryScreen />);

    expect(getByText('Pinned')).toBeTruthy();
    expect(getByText('Learned from chats')).toBeTruthy();
    expect(getByText('allergic to peanuts')).toBeTruthy();
    expect(getByText('prefers rust over python')).toBeTruthy();
  });

  it('states how many memories it was generated from', () => {
    mockEntries.push({
      id: '1',
      fact: 'prefers rust over python',
      source_conversation_id: null,
      pinned: false,
      created_at: Date.now(),
    });

    const { getByText } = render(<MemorySummaryScreen />);

    expect(
      getByText(/^Generated from 1 memory on .+\. Source: memories saved on this device\.$/),
    ).toBeTruthy();
  });

  it('keeps the provenance line honest on an empty store', () => {
    const { getByText } = render(<MemorySummaryScreen />);

    expect(getByText('Nothing learned yet')).toBeTruthy();
    expect(getByText(/^Generated from 0 memories on /)).toBeTruthy();
  });

  it('says the listed memories are unused while the master switch is off', () => {
    useLocalSettingsStore.setState({ memoryEnabled: false });
    mockEntries.push({
      id: '1',
      fact: 'prefers rust over python',
      source_conversation_id: null,
      pinned: false,
      created_at: Date.now(),
    });

    const { getByText } = render(<MemorySummaryScreen />);

    expect(getByText(/Memory is off, so none of these are used in new chats/)).toBeTruthy();
  });

  it('names the Cloud trust boundary when the app is in Cloud mode', () => {
    useChatAppModeStore.setState({ appMode: 'cloud' });

    const { getByText } = render(<MemorySummaryScreen />);

    expect(getByText('Cloud account memory')).toBeTruthy();
    expect(getByText(/Source: your AGI account memories\.$/)).toBeTruthy();
  });
});
