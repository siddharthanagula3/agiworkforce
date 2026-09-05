import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeFocusSection } from './TimeFocusSection';

const preferenceMocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  save: vi.fn(),
}));

vi.mock('@/app/settings/_lib/preferences-client', () => ({
  fetchPreferenceNamespace: preferenceMocks.fetch,
  savePreferenceNamespace: preferenceMocks.save,
}));

describe('TimeFocusSection', () => {
  beforeEach(() => {
    preferenceMocks.fetch.mockReset();
    preferenceMocks.save.mockReset();
    preferenceMocks.fetch.mockResolvedValue({
      breakReminderMinutes: 60,
      quietHours: {
        enabled: true,
        days: [1],
        startTime: '22:00',
        endTime: '08:00',
        timezone: 'UTC',
      },
    });
    preferenceMocks.save.mockResolvedValue(undefined);
  });

  it('loads and saves one validated account-wide preference namespace', async () => {
    render(<TimeFocusSection />);

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(preferenceMocks.fetch).toHaveBeenCalledWith(
      'time-focus',
      expect.objectContaining({ breakReminderMinutes: null }),
    );
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.change(screen.getByRole('combobox', { name: 'Break reminder' }), {
      target: { value: '120' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tuesday' }));
    fireEvent.change(screen.getByLabelText('Quiet hours start'), {
      target: { value: '21:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save time and focus settings' }));

    await waitFor(() =>
      expect(preferenceMocks.save).toHaveBeenCalledWith('time-focus', {
        breakReminderMinutes: 120,
        quietHours: {
          enabled: true,
          days: [1, 2],
          startTime: '21:30',
          endTime: '08:00',
          timezone: 'UTC',
        },
      }),
    );
  });

  it('rejects an ambiguous all-day range instead of silently saving it', async () => {
    render(<TimeFocusSection />);
    expect(await screen.findByText('Saved')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Quiet hours end'), {
      target: { value: '22:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save time and focus settings' }));

    expect(await screen.findByText('Choose different start and end times.')).toBeInTheDocument();
    expect(preferenceMocks.save).not.toHaveBeenCalled();
  });

  it('surfaces persistence failures without claiming the settings synced', async () => {
    preferenceMocks.save.mockRejectedValue(new Error('storage unavailable'));
    render(<TimeFocusSection />);
    expect(await screen.findByText('Saved')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Break reminder' }), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save time and focus settings' }));

    expect(await screen.findByText('Save failed: storage unavailable')).toBeInTheDocument();
  });

  it('renders break reminder and quiet hours as rows, not bordered cards', async () => {
    render(<TimeFocusSection />);
    await screen.findByText('Saved');

    expect(document.querySelector('[style*="border-radius: var(--radius-lg)"]')).toBeNull();
    expect(screen.queryByText(/loading account settings/i)).toBeNull();
  });
});
