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

  it('marks the form unsaved, then shows the write in flight, then settles quietly', async () => {
    let releaseSave: () => void = () => {};
    preferenceMocks.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseSave = resolve;
        }),
    );
    render(<TimeFocusSection />);
    expect(await screen.findByText('Saved')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Break reminder' }), {
      target: { value: '30' },
    });
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');

    fireEvent.click(screen.getByRole('button', { name: 'Save time and focus settings' }));
    expect(screen.getByRole('status')).toHaveTextContent('Saving...');

    releaseSave();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
    expect(screen.queryByRole('alert')).toBeNull();
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

  it.each([
    ['start', 'Quiet hours start'],
    ['end', 'Quiet hours end'],
  ])('rejects a cleared %s time instead of saving a disabled schedule', async (_name, label) => {
    render(<TimeFocusSection />);
    expect(await screen.findByText('Saved')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(label), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save time and focus settings' }));

    expect(await screen.findByText('Enter both a start and an end time.')).toBeInTheDocument();
    expect(preferenceMocks.save).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: 'Enable quiet hours' })).toBeChecked();

    fireEvent.change(screen.getByLabelText(label), {
      target: { value: label.endsWith('start') ? '21:00' : '07:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save time and focus settings' }));

    await waitFor(() =>
      expect(preferenceMocks.save).toHaveBeenCalledWith(
        'time-focus',
        expect.objectContaining({
          quietHours: expect.objectContaining({ enabled: true }),
        }),
      ),
    );
  });

  it('still saves an intentional switch-off', async () => {
    render(<TimeFocusSection />);
    expect(await screen.findByText('Saved')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch', { name: 'Enable quiet hours' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save time and focus settings' }));

    await waitFor(() =>
      expect(preferenceMocks.save).toHaveBeenCalledWith(
        'time-focus',
        expect.objectContaining({
          quietHours: expect.objectContaining({ enabled: false, days: [1] }),
        }),
      ),
    );
  });

  it('surfaces persistence failures without claiming the settings synced', async () => {
    preferenceMocks.save.mockRejectedValue(new Error('storage unavailable'));
    render(<TimeFocusSection />);
    expect(await screen.findByText('Saved')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Break reminder' }), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save time and focus settings' }));

    const failure = await screen.findByRole('alert');
    expect(failure).toHaveTextContent('Save failed: storage unavailable');
    expect(failure).toHaveStyle({ color: 'var(--settings-destructive-text)' });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders break reminder and quiet hours as rows, not bordered cards', async () => {
    render(<TimeFocusSection />);
    await screen.findByText('Saved');

    expect(document.querySelector('[style*="border-radius: var(--radius-lg)"]')).toBeNull();
    expect(screen.queryByText(/loading account settings/i)).toBeNull();
  });
});
