import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('server-only', () => ({}));

import MaintenancePage, { dynamic } from '../page';

const START = Date.parse('2026-12-01T08:00:00.000Z');
const END = Date.parse('2026-12-01T09:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;

function renderAt(ms: number) {
  vi.setSystemTime(ms);
  return render(<MaintenancePage />);
}

describe('maintenance page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    process.env['AGI_MAINTENANCE_WINDOW'] = '2026-12-01T08:00:00.000Z/2026-12-01T09:00:00.000Z';
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env['AGI_MAINTENANCE_WINDOW'];
  });

  it('is rendered per request so the phase is never frozen at build time', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('describes an upcoming window as scheduled, not as in progress', () => {
    renderAt(START - HOUR_MS);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Maintenance is coming up.');
    expect(document.body.textContent).toContain(
      'Planned maintenance runs from Dec 1, 2026, 8:00 AM UTC to Dec 1, 2026, 9:00 AM UTC.',
    );
    expect(document.body.textContent).not.toMatch(/unavailable|back shortly/i);
  });

  it('describes the window as in progress only from its start until its end', () => {
    renderAt(START);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('We’ll be back shortly.');
    expect(document.body.textContent).toContain('due to end at Dec 1, 2026, 9:00 AM UTC');
  });

  it('does not present maintenance as active at the end instant', () => {
    renderAt(END);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'No maintenance is scheduled.',
    );
    expect(document.body.textContent).not.toMatch(/back shortly|unavailable/i);
  });

  it.each([
    ['absent', undefined],
    ['reversed', '2026-12-01T09:00:00.000Z/2026-12-01T08:00:00.000Z'],
    ['malformed', 'soon'],
  ])('does not claim maintenance when the configuration is %s', (_label, value) => {
    if (value === undefined) delete process.env['AGI_MAINTENANCE_WINDOW'];
    else process.env['AGI_MAINTENANCE_WINDOW'] = value;

    renderAt(START + 1);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'No maintenance is scheduled.',
    );
  });

  it('keeps the live status link in every phase', () => {
    renderAt(START - HOUR_MS);
    expect(screen.getByRole('link', { name: 'Check live status' }).getAttribute('href')).toBe(
      '/status',
    );
  });
});
