import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { INITIAL_SCHEDULE_DRAFT } from '../lib/schedule-form';
import type { ScheduleDraft } from '../types';
import { ScheduleForm } from './ScheduleForm';

type UseConnectorsModule = typeof import('@/features/connectors/hooks/use-connectors');

vi.mock('@/features/connectors/hooks/use-connectors', async (importOriginal) => ({
  ...(await importOriginal<UseConnectorsModule>()),
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    customNames: {},
    toolConnectorIds: {},
    loading: false,
    error: null,
    retry: vi.fn(),
  }),
}));

function renderForm(
  patch: Partial<ScheduleDraft>,
  onChange = vi.fn(),
  agentOptions: ComponentProps<typeof ScheduleForm>['agentOptions'] = [],
) {
  render(
    <ScheduleForm
      draft={{ ...INITIAL_SCHEDULE_DRAFT, ...patch }}
      errors={{}}
      submitError={null}
      saving={false}
      isEdit={false}
      creditsUsed={null}
      modelOptions={[{ value: 'auto', label: 'Auto' }]}
      agentOptions={agentOptions}
      onChange={onChange}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
    />,
  );
  return onChange;
}

describe('ScheduleForm end date', () => {
  it('offers an optional end date for a recurring schedule and writes it to the expiry', () => {
    const onChange = renderForm({ recurrence: 'daily', timezone: 'UTC' });

    const endDate = screen.getByLabelText('End date (optional)');
    expect(endDate).toHaveAttribute('type', 'datetime-local');
    expect(endDate).toHaveAccessibleDescription(/No run starts after this/);

    fireEvent.change(endDate, { target: { value: '2027-01-31T09:00' } });
    expect(onChange).toHaveBeenCalledWith({ expiresLocal: '2027-01-31T09:00' });
  });

  it('shows the end date once, outside the execution limits', () => {
    renderForm({ recurrence: 'weekly' });

    expect(screen.getAllByLabelText(/End date|Expire/)).toHaveLength(1);
    expect(screen.getByText('Execution Limits').closest('details')).not.toContainElement(
      screen.getByLabelText('End date (optional)'),
    );
  });

  it('hides the end date for a one-time run that has none', () => {
    renderForm({ recurrence: 'once', expiresLocal: '' });

    expect(screen.queryByLabelText('End date (optional)')).not.toBeInTheDocument();
  });

  it('keeps a saved end date visible on a one-time run so it is never sent unseen', () => {
    renderForm({ recurrence: 'once', expiresLocal: '2027-01-31T09:00' });

    expect(screen.getByLabelText('End date (optional)')).toHaveValue('2027-01-31T09:00');
  });
});

describe('ScheduleForm agent choice', () => {
  const agents = [
    { id: 'a1', name: 'Release notes', description: 'Drafts notes from merged work.' },
    { id: 'a2', name: 'Triage', description: '' },
  ];

  it('describes the chosen agent in one line under the select', () => {
    renderForm({ agentId: 'a1' }, vi.fn(), agents);

    const select = screen.getByLabelText('Run as agent');
    expect(select).toHaveValue('a1');
    expect(select).toHaveAccessibleDescription(/Drafts notes from merged work\./);
  });

  it('shows no description line for no agent or an agent without one', () => {
    renderForm({ agentId: 'a2' }, vi.fn(), agents);

    expect(screen.queryByText('Drafts notes from merged work.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Run as agent')).toHaveAccessibleDescription(/^Each run follows/);
  });
});
