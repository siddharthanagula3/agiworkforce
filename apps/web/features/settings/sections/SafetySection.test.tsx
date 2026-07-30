import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SafetySection } from './SafetySection';

const mocks = vi.hoisted(() => ({
  fetchPreferences: vi.fn(),
  savePreferences: vi.fn(),
}));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: (...args: unknown[]) => mocks.fetchPreferences(...args),
  savePreferenceNamespace: (...args: unknown[]) => mocks.savePreferences(...args),
}));

vi.mock('@agiworkforce/ui', () => ({
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
    'aria-label': ariaLabel,
  }: {
    checked: boolean;
    disabled: boolean;
    onCheckedChange: (value: boolean) => void;
    'aria-label': string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
    />
  ),
}));

describe('Web Safety settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchPreferences.mockResolvedValue({ reduceSensitiveContent: false });
    mocks.savePreferences.mockResolvedValue(undefined);
  });

  it('persists the account safety preference used by Managed Cloud admission', async () => {
    render(<SafetySection />);

    const toggle = await screen.findByRole('switch', { name: 'Reduce sensitive content' });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);

    await waitFor(() =>
      expect(mocks.savePreferences).toHaveBeenCalledWith('safety', {
        reduceSensitiveContent: true,
      }),
    );
    expect(screen.getByText('Synced to your account')).toBeInTheDocument();
  });

  it('states the exact enforcement and non-monitoring boundary', async () => {
    render(<SafetySection />);

    expect(
      screen.getByText(/Block clearly explicit or harmful how-to prompts before they reach/),
    ).toBeInTheDocument();
    expect(screen.getByText(/does not monitor conversations/)).toBeInTheDocument();
    await screen.findByText('Synced to your account');
  });
});
