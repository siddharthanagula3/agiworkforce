import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@shared/components/layout/WebAppShell', () => ({
  WebAppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="managed-app-shell">{children}</div>
  ),
}));

vi.mock('@/features/schedules', () => ({
  SchedulesPage: () => <div>Canonical Schedule Manager</div>,
  SchedulesPageWithProjects: () => <div>Canonical Schedule Manager</div>,
}));

import SchedulesRoute, { metadata } from './page';

describe('/schedules route', () => {
  it('mounts the canonical manager inside the authenticated app shell', () => {
    render(<SchedulesRoute />);

    expect(screen.getByTestId('managed-app-shell')).toHaveTextContent('Canonical Schedule Manager');
  });

  it('keeps per-user schedule data out of search indexes', () => {
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
  });
});
