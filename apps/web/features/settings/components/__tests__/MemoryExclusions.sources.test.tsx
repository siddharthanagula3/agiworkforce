import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const fetchStoredPreferenceNamespace = vi.fn(async () => ({
  excludedTerms: ['salary'],
  suppressedSources: [] as string[],
}));
const savePreferenceNamespace = vi.fn(async () => undefined);

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchStoredPreferenceNamespace: (...args: unknown[]) =>
    fetchStoredPreferenceNamespace(...(args as [])),
  savePreferenceNamespace: (...args: unknown[]) => savePreferenceNamespace(...(args as [])),
}));

import { MemoryExclusions } from '../MemoryExclusions';

describe('memory source suppression control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('suppresses a source without losing the excluded terms', async () => {
    const user = userEvent.setup();
    render(<MemoryExclusions />);

    const toggle = await screen.findByRole('checkbox', {
      name: /automatically captured/i,
    });
    expect(toggle).not.toBeChecked();

    await user.click(toggle);

    await waitFor(() => expect(savePreferenceNamespace).toHaveBeenCalled());
    expect(savePreferenceNamespace).toHaveBeenCalledWith('memory', {
      excludedTerms: ['salary'],
      suppressedSources: ['auto'],
    });
    await waitFor(() => expect(toggle).toBeChecked());
  });

  it('restores a suppressed source', async () => {
    fetchStoredPreferenceNamespace.mockResolvedValueOnce({
      excludedTerms: [],
      suppressedSources: ['desktop'],
    });
    const user = userEvent.setup();
    render(<MemoryExclusions />);

    const toggle = await screen.findByRole('checkbox', { name: /desktop/i });
    await waitFor(() => expect(toggle).toBeChecked());

    await user.click(toggle);

    await waitFor(() =>
      expect(savePreferenceNamespace).toHaveBeenCalledWith('memory', {
        excludedTerms: [],
        suppressedSources: [],
      }),
    );
  });
});
