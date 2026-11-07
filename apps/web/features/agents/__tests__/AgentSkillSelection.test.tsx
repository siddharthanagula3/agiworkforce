import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AGENT_SELECTION_MAX } from '@agiworkforce/cloud-contracts';

import { AgentSkillSelection } from '../components/AgentSkillSelection';
import type { AgentChoiceList } from '../components/AgentConfigForm';

const OPTIONS = [
  {
    id: 'ab-testing',
    name: 'A/B Test Setup',
    description: 'Design controlled experiments and compare variants.',
  },
  {
    id: 'review-contract',
    name: 'Contract review',
    description: 'Review clauses and negotiation risks.',
  },
  {
    id: 'document-creation',
    name: 'Document creation',
    description: 'Prepare a polished document from verified content.',
  },
];

function Harness({
  initial = null,
  list = {},
  disabled = false,
}: {
  initial?: string[] | null;
  list?: Partial<AgentChoiceList>;
  disabled?: boolean;
}) {
  const [selected, setSelected] = useState(initial);
  return (
    <>
      <AgentSkillSelection
        list={{ loading: false, error: null, retry: vi.fn(), options: OPTIONS, ...list }}
        selected={selected}
        disabled={disabled}
        onChange={setSelected}
      />
      <button type="button">Next action</button>
      <output aria-label="Skill configuration">{JSON.stringify(selected)}</output>
    </>
  );
}

function configuration() {
  return JSON.parse(screen.getByLabelText('Skill configuration').textContent ?? 'null');
}

describe('agent skill selection', () => {
  it('retains shared radio keyboard navigation and checked state with the scoped target geometry', async () => {
    render(<Harness />);
    const inherited = screen.getByRole('radio', { name: "Use each person's enabled skills" });
    const individual = screen.getByRole('radio', { name: 'Choose individual skills' });
    await userEvent.tab();
    expect(inherited).toHaveFocus();
    await userEvent.keyboard('{ArrowDown>}');
    await waitFor(() => expect(individual).toBeChecked());
    await userEvent.keyboard('{/ArrowDown}');
    expect(individual).toHaveFocus();
    expect(configuration()).toEqual([]);
    await userEvent.keyboard('{ArrowUp>}');
    await waitFor(() => expect(inherited).toBeChecked());
    await userEvent.keyboard('{/ArrowUp}');
    expect(configuration()).toBeNull();
  });
  it('keeps inherited null distinct from an explicitly empty selection', async () => {
    render(<Harness />);
    expect(screen.getByRole('radio', { name: "Use each person's enabled skills" })).toBeChecked();
    expect(screen.getByText('Inherited · 3 available to you')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Search skills' })).toBeNull();
    expect(screen.queryByRole('option')).toBeNull();
    expect(configuration()).toBeNull();

    await userEvent.click(screen.getByRole('radio', { name: 'Choose individual skills' }));
    expect(configuration()).toEqual([]);
    expect(screen.getByText('0 selected')).toBeInTheDocument();
    expect(
      screen.getByText('No skills selected. This agent will not load any skills.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: "Use each person's enabled skills" }));
    expect(configuration()).toBeNull();
  });

  it.each(['A/B Test', 'controlled experiments', 'ab-testing'])(
    'finds canonical metadata by title, description or ID: %s',
    async (query) => {
      render(<Harness initial={[]} />);
      await userEvent.type(screen.getByRole('combobox', { name: 'Search skills' }), query);
      expect(screen.getAllByRole('option')).toHaveLength(1);
      expect(screen.getByRole('option', { name: 'A/B Test Setup' })).toHaveAccessibleDescription(
        'Design controlled experiments and compare variants.',
      );
    },
  );

  it('selects multiple canonical IDs with arrows and Enter while Tab skips the catalog', async () => {
    render(<Harness initial={[]} />);
    const search = screen.getByRole('combobox', { name: 'Search skills' });
    await userEvent.click(search);
    await userEvent.keyboard('{Enter}{ArrowDown}{Enter}');
    expect(configuration()).toEqual(['ab-testing', 'review-contract']);
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(search).toHaveFocus();
    expect(screen.getByRole('option', { name: 'A/B Test Setup' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: 'Contract review' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Select all' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Clear selection' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Next action' })).toHaveFocus();
  });

  it('retains unavailable saved IDs and does not change hidden choices when filtering or clearing results', async () => {
    render(<Harness initial={['not-in-catalog', 'document-creation']} />);
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Not In Catalog' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    const search = screen.getByRole('combobox', { name: 'Search skills' });
    await userEvent.type(search, 'polished document');
    expect(configuration()).toEqual(['not-in-catalog', 'document-creation']);
    await userEvent.click(screen.getByRole('button', { name: 'Clear results' }));
    expect(configuration()).toEqual(['not-in-catalog']);
    await userEvent.click(screen.getByRole('button', { name: 'Select results' }));
    expect(configuration()).toEqual(['not-in-catalog', 'document-creation']);
  });

  it('exposes a recoverable catalog error without changing a saved selection', async () => {
    const retry = vi.fn();
    render(
      <Harness
        initial={['review-contract']}
        list={{ error: 'Skills could not be loaded.', retry }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Skills could not be loaded.');
    expect(configuration()).toEqual(['review-contract']);
    expect(screen.queryByRole('option')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('keeps empty and no-match states explicit', async () => {
    const view = render(<Harness initial={[]} list={{ options: [] }} />);
    expect(screen.getByText('No skills are available to select.')).toBeInTheDocument();
    view.unmount();
    render(<Harness initial={[]} />);
    await userEvent.type(screen.getByRole('combobox'), 'not a matching capability');
    expect(screen.getByText('No skills match your search.')).toBeInTheDocument();
    expect(configuration()).toEqual([]);
  });

  it('enforces the existing selection limit for pointer and keyboard actions', async () => {
    const initial = Array.from({ length: AGENT_SELECTION_MAX }, (_, index) => `saved-${index}`);
    render(<Harness initial={initial} />);
    const option = screen.getByRole('option', { name: 'A/B Test Setup' });
    expect(option).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(option);
    expect(configuration()).toEqual(initial);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(configuration()).toEqual(initial);
    expect(
      screen.getByText(`You can select up to ${AGENT_SELECTION_MAX} skills.`),
    ).toBeInTheDocument();
  });

  it('keeps read-only controls disabled', () => {
    render(<Harness initial={['ab-testing']} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Choose individual skills' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'A/B Test Setup' })).toBeDisabled();
    expect(configuration()).toEqual(['ab-testing']);
  });
});
