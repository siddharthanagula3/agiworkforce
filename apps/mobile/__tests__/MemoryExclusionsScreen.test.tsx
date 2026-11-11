/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockFetchNamespace = jest.fn();
const mockPatchNamespace = jest.fn();

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({
    back: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('lucide-react-native', () => {
  const { View } = require('react-native');
  const Icon = (props: Record<string, unknown>) => <View {...props} />;
  return new Proxy({}, { get: () => Icon });
});

jest.mock('@/services/preferences', () => ({
  fetchPreferenceNamespace: (...args: unknown[]) => mockFetchNamespace(...args),
  patchPreferenceNamespace: (...args: unknown[]) => mockPatchNamespace(...args),
}));

import MemoryExclusionsScreen from '../app/(app)/settings/memory-exclusions';

describe('Never remember exclusions baseline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPatchNamespace.mockResolvedValue(undefined);
  });

  it('keeps editing closed and offers a retry when the first read fails', async () => {
    mockFetchNamespace.mockRejectedValueOnce(new Error('offline'));
    render(<MemoryExclusionsScreen />);

    await waitFor(() =>
      expect(screen.getByLabelText('Retry loading what memory leaves out')).toBeTruthy(),
    );

    expect(screen.queryByText(/No exclusions yet/)).toBeNull();
    expect(screen.queryByText('WHERE MEMORIES COME FROM')).toBeNull();
    expect(screen.getByLabelText('Term to never remember').props.editable).toBe(false);

    fireEvent.changeText(screen.getByLabelText('Term to never remember'), 'cobalt');
    fireEvent.press(screen.getByLabelText('Add term'));

    expect(mockPatchNamespace).not.toHaveBeenCalled();
  });

  it('adds a term on top of the stored baseline once a retry succeeds', async () => {
    mockFetchNamespace.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({
      excludedTerms: ['orchid'],
      suppressedSources: ['auto'],
    });
    render(<MemoryExclusionsScreen />);

    await waitFor(() =>
      expect(screen.getByLabelText('Retry loading what memory leaves out')).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Retry loading what memory leaves out'));
    });
    await waitFor(() => expect(screen.getByText('orchid')).toBeTruthy());

    fireEvent.changeText(screen.getByLabelText('Term to never remember'), 'cobalt');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Add term'));
    });

    expect(mockPatchNamespace).toHaveBeenCalledWith('memory', {
      excludedTerms: ['orchid', 'cobalt'],
      suppressedSources: ['auto'],
    });
  });

  it('treats a rejected-shape response as a failed read', async () => {
    mockFetchNamespace.mockRejectedValueOnce(
      new Error('Account preferences returned an invalid settings response'),
    );
    render(<MemoryExclusionsScreen />);

    await waitFor(() =>
      expect(screen.getByLabelText('Retry loading what memory leaves out')).toBeTruthy(),
    );
    expect(mockFetchNamespace).toHaveBeenCalledWith('memory', { strictSettings: true });
  });

  it('opens editing on a genuinely empty stored namespace', async () => {
    mockFetchNamespace.mockResolvedValueOnce({});
    render(<MemoryExclusionsScreen />);

    await waitFor(() => expect(screen.getByText(/No exclusions yet/)).toBeTruthy());
    expect(screen.getByLabelText('Term to never remember').props.editable).toBe(true);

    fireEvent.changeText(screen.getByLabelText('Term to never remember'), 'cobalt');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Add term'));
    });

    expect(mockPatchNamespace).toHaveBeenCalledWith('memory', {
      excludedTerms: ['cobalt'],
      suppressedSources: [],
    });
  });
});
