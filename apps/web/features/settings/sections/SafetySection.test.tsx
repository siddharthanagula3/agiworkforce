import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SafetySection } from './SafetySection';

const mocks = vi.hoisted(() => ({
  fetchPreferences: vi.fn(),
  savePreferences: vi.fn(),
  invalidateSnapshot: vi.fn(),
}));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  invalidatePreferencesSnapshot: () => mocks.invalidateSnapshot(),
  fetchPreferenceNamespace: (...args: unknown[]) => mocks.fetchPreferences(...args),
  savePreferenceNamespace: (...args: unknown[]) => mocks.savePreferences(...args),
}));

vi.mock('@agiworkforce/ui', () => ({
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
  }: {
    checked: boolean;
    disabled: boolean;
    onCheckedChange: (value: boolean) => void;
    'aria-label': string;
    'aria-describedby'?: string;
  }) => (
    <button
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
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
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders only the heading and the one setting once loaded', async () => {
    render(<SafetySection />);

    const toggle = await screen.findByRole('switch', { name: 'Reduce sensitive content' });
    await waitFor(() => expect(toggle).not.toBeDisabled());

    expect(screen.getByRole('heading', { level: 1, name: 'Safety' })).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Synced to your account')).toBeNull();
    expect(screen.queryByText(/prompt admission/)).toBeNull();
  });

  it('states the enforcement and non-monitoring boundary in one line with a Learn more link', async () => {
    render(<SafetySection />);

    const toggle = await screen.findByRole('switch', { name: 'Reduce sensitive content' });
    expect(toggle).toHaveAccessibleDescription(
      /Refuse explicit or harmful how-to prompts\. Does not monitor chats, alert anyone or replace emergency services\. Learn more/,
    );
    const link = screen.getByRole('link', { name: 'Learn more' });
    expect(link).toHaveAttribute('href', '/help/crisis-resources');
    expect(link).toHaveStyle({ textDecoration: 'underline' });
    await waitFor(() => expect(toggle).not.toBeDisabled());
  });

  it('shows the error and restores the switch when saving fails', async () => {
    mocks.savePreferences.mockRejectedValue(new Error('Network unreachable'));
    render(<SafetySection />);

    const toggle = await screen.findByRole('switch', { name: 'Reduce sensitive content' });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
  });

  it('shows the persisted value, not the inverse, when a save fails after the server committed it', async () => {
    mocks.fetchPreferences
      .mockResolvedValueOnce({ reduceSensitiveContent: false })
      .mockResolvedValueOnce({ reduceSensitiveContent: true });
    mocks.savePreferences.mockRejectedValue(new Error('Response lost'));
    render(<SafetySection />);

    const toggle = await screen.findByRole('switch', { name: 'Reduce sensitive content' });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(mocks.invalidateSnapshot).toHaveBeenCalled();
    expect(mocks.fetchPreferences).toHaveBeenCalledTimes(2);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('says the saved setting is unconfirmed when the save and the re-read both fail', async () => {
    mocks.fetchPreferences
      .mockResolvedValueOnce({ reduceSensitiveContent: false })
      .mockRejectedValueOnce(new Error('offline'));
    mocks.savePreferences.mockRejectedValue(new Error('offline'));
    render(<SafetySection />);

    const toggle = await screen.findByRole('switch', { name: 'Reduce sensitive content' });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not confirm the saved safety setting. Reload to check it.',
    );
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
  });
});
