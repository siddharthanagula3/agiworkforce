import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SessionAuthority } from '@/lib/identity/request-authority';

let session: SessionAuthority;
let sequence = 0;
function replaceAccount() {
  const id = `exclusions-${++sequence}`;
  const next: SessionAuthority = {
    userId: id,
    sessionId: id,
    isCurrent: () => session === next,
    getToken: async () => 'fixture-token',
  };
  session = next;
}

vi.mock('@/lib/identity/useSessionSnapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/identity/useSessionSnapshot')>()),
  useSessionSnapshot: () => () => session,
}));

const fetchStoredPreferenceNamespace = vi.fn(async () => ({
  excludedTerms: ['salary'],
  suppressedSources: [] as string[],
}));
const savePreferenceNamespace = vi.fn(async () => undefined);

vi.mock('@/app/settings/_lib/preferences-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/app/settings/_lib/preferences-client')>()),
  fetchOwnedPreferenceNamespace: (_owner: unknown, ...args: unknown[]) =>
    fetchStoredPreferenceNamespace(...(args as [])),
  saveOwnedPreferenceNamespace: (_owner: unknown, ...args: unknown[]) =>
    savePreferenceNamespace(...(args as [])),
}));

import { MemoryExclusions } from '../MemoryExclusions';

describe('memory source suppression control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    replaceAccount();
  });

  it('suppresses a source without losing the excluded terms', async () => {
    const user = userEvent.setup();
    render(<MemoryExclusions />);

    const toggle = await screen.findByRole('checkbox', {
      name: /automatically captured/i,
    });
    await waitFor(() => expect(toggle).toBeEnabled());
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

  it('does not render a retired account read after replacement', async () => {
    let finish!: (value: { excludedTerms: string[]; suppressedSources: string[] }) => void;
    fetchStoredPreferenceNamespace.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const view = render(<MemoryExclusions />);
    fetchStoredPreferenceNamespace.mockResolvedValueOnce({
      excludedTerms: ['current-account'],
      suppressedSources: [],
    });
    replaceAccount();
    view.rerender(<MemoryExclusions />);
    expect(await screen.findByText('current-account')).toBeVisible();
    await act(async () => {
      finish({ excludedTerms: ['old-account'], suppressedSources: ['auto'] });
    });
    expect(screen.queryByText('old-account')).toBeNull();
    expect(screen.getByRole('checkbox', { name: /automatically captured/i })).not.toBeChecked();
  });

  it('ignores a retired account save failure and finally cleanup', async () => {
    let fail!: (reason: unknown) => void;
    savePreferenceNamespace.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    const user = userEvent.setup();
    const view = render(<MemoryExclusions />);
    const toggle = screen.getByRole('checkbox', { name: /automatically captured/i });
    await waitFor(() => expect(toggle).toBeEnabled());
    await user.click(toggle);
    await waitFor(() => expect(savePreferenceNamespace).toHaveBeenCalledTimes(1));
    fetchStoredPreferenceNamespace.mockResolvedValueOnce({
      excludedTerms: ['current-account'],
      suppressedSources: [],
    });
    replaceAccount();
    view.rerender(<MemoryExclusions />);
    expect(await screen.findByText('current-account')).toBeVisible();
    await act(async () => {
      fail(new Error('old-account failure'));
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('checkbox', { name: /automatically captured/i })).toBeEnabled();
  });
});
