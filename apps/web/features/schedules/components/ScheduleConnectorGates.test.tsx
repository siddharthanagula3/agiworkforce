import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  CONNECTORS_COMING_SOON_LABEL,
  CONNECTORS_COMING_SOON_MESSAGE,
  connectorsReleased,
} from '@agiworkforce/types';

vi.mock('@/features/connectors/hooks/use-connectors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/connectors/hooks/use-connectors')>()),
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    customNames: {},
    toolConnectorIds: {},
    loading: false,
    error: null,
    retry: vi.fn(),
  }),
}));

import { ScheduleAccessFields } from './ScheduleAccessFields';
import ScheduleTriggersPanel from './ScheduleTriggersPanel';

const SOURCES = { project: false, memory: false, web: true, recentChats: false };

describe('schedule controls while connectors are coming soon', () => {
  it('says connectors are coming soon instead of sending the user to connect one', () => {
    expect(connectorsReleased()).toBe(false);
    render(
      <ScheduleAccessFields
        hasProject={false}
        sources={SOURCES}
        connectors={null}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText(CONNECTORS_COMING_SOON_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Connect one' })).toBeNull();
    expect(screen.queryByText(/No connectors are connected/)).toBeNull();
  });

  it('offers Gmail and Calendar triggers only as coming soon', () => {
    render(<ScheduleTriggersPanel scheduleId="task-1" scheduleName="Digest" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add trigger' }));

    const source = screen.getByRole('combobox', { name: 'Source' });
    const option = (name: string) => within(source).getByRole('option', { name });
    expect(option(`Gmail (${CONNECTORS_COMING_SOON_LABEL})`)).toBeDisabled();
    expect(option(`Google Calendar (${CONNECTORS_COMING_SOON_LABEL})`)).toBeDisabled();
    expect(option('GitHub')).toBeEnabled();
    expect(option('Slack')).toBeEnabled();
    expect(option('Anything else (signed webhook)')).toBeEnabled();
  });
});
