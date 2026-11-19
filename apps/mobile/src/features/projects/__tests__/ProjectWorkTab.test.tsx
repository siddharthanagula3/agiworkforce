jest.mock('@/lib/mmkv', () => ({
  rehydrateWhenMmkvReady: jest.fn(),
  whenMmkvReady: jest.fn((cb: () => void) => cb()),
  storage: { getString: jest.fn(), set: jest.fn(), delete: jest.fn() },
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const mockListRuns = jest.fn();
jest.mock('@/services/streaming', () => ({
  createMobileCloudAgentRunClient: () => ({ listRuns: mockListRuns }),
}));

jest.mock('@/components/ui/LoadingIndicator', () => ({ LoadingIndicator: () => null }));

jest.mock('@/src/features/tasks/service', () => ({
  describeCloudRunError: (_error: unknown, fallback: string) => fallback,
}));

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import { ProjectWorkTab } from '@/src/features/projects/components/ProjectWorkTab';
import { useTierStore } from '@/src/features/billing/store';

describe('ProjectWorkTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListRuns.mockResolvedValue({ runs: [] });
  });

  afterEach(() => {
    useTierStore.setState({ tier: 'free', lastRefreshedAt: null });
  });

  it('says AGI Work is not included on the Free plan, without asking for a purchase and without loading runs', () => {
    useTierStore.setState({ tier: 'free', lastRefreshedAt: new Date().toISOString() });
    render(<ProjectWorkTab projectId="p-1" projectName="Launch plan" />);

    expect(screen.getByText(`${PRODUCT_NAMES.work} isn’t included in your plan.`)).toBeTruthy();
    expect(screen.queryByText(/Switch a chat/)).toBeNull();
    expect(screen.queryByText(/upgrade|buy|purchase|subscribe/i)).toBeNull();
    expect(mockListRuns).not.toHaveBeenCalled();
  });

  it('lists the project’s runs on a plan with AGI Work and explains the empty list', async () => {
    useTierStore.setState({ tier: 'pro', lastRefreshedAt: new Date().toISOString() });
    render(<ProjectWorkTab projectId="p-1" projectName="Launch plan" />);

    expect(
      await screen.findByText(
        `Switch a chat in Launch plan to ${PRODUCT_NAMES.work} and its runs will be listed here.`,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(`${PRODUCT_NAMES.work} isn’t included in your plan.`)).toBeNull();
    await waitFor(() =>
      expect(mockListRuns).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p-1' })),
    );
  });

  it('asks the server instead of claiming the plan lacks AGI Work before the plan is known', async () => {
    useTierStore.setState({ tier: 'free', lastRefreshedAt: null });
    render(<ProjectWorkTab projectId="p-1" projectName="Launch plan" />);

    expect(screen.queryByText(/isn’t included in your plan/)).toBeNull();
    await waitFor(() =>
      expect(mockListRuns).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p-1' })),
    );
  });

  it('switches from loading to the runs once a paid plan becomes known', async () => {
    useTierStore.setState({ tier: 'free', lastRefreshedAt: null });
    render(<ProjectWorkTab projectId="p-1" projectName="Launch plan" />);

    act(() => {
      useTierStore.setState({ tier: 'pro', lastRefreshedAt: new Date().toISOString() });
    });

    expect(screen.queryByText(/isn’t included in your plan/)).toBeNull();
    expect(
      await screen.findByText(
        `Switch a chat in Launch plan to ${PRODUCT_NAMES.work} and its runs will be listed here.`,
      ),
    ).toBeTruthy();
  });
});
