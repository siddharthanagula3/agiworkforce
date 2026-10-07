import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlanComparisonStack } from './PlanComparisonStack';

type ReactI18nextModule = typeof import('react-i18next');

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<ReactI18nextModule>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

interface Row {
  planId: string;
  label: string;
  price: string;
  projects: string;
  deepResearch: string;
}

const COLUMNS = [
  ['price', 'Price'],
  ['projects', 'Projects'],
  ['deepResearch', 'Deep Research'],
] as const;

const ROWS: Row[] = [
  { planId: 'free', label: 'Free', price: 'Free', projects: '1 project', deepResearch: 'No' },
  { planId: 'pro', label: 'Pro', price: '$20/mo', projects: '25 projects', deepResearch: 'Yes' },
  {
    planId: 'team',
    label: 'Team',
    price: '$25/seat/mo',
    projects: '25 projects',
    deepResearch: 'Yes',
  },
];

const cellValue = (column: string, row: Row) => row[column as keyof Omit<Row, 'planId' | 'label'>];

function listedPairs(planLabel: string): [string, string][] {
  const list = screen.getByLabelText(planLabel);
  expect(list.tagName).toBe('DL');
  const terms = [...list.querySelectorAll('dt')];
  const values = [...list.querySelectorAll('dd')];
  expect(values).toHaveLength(terms.length);
  return terms.map((term, index) => [term.textContent ?? '', values[index]?.textContent ?? '']);
}

describe('PlanComparisonStack', () => {
  it('lists every column label and value for the first plan, in column order', () => {
    render(<PlanComparisonStack rows={ROWS} columns={COLUMNS} cellValue={cellValue} />);

    const select = screen.getByRole('combobox', { name: 'compareStackPlanLabel' });
    expect(select).toHaveValue('free');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Free', 'Pro', 'Team']);
    expect(listedPairs('Free')).toEqual([
      ['Price', 'Free'],
      ['Projects', '1 project'],
      ['Deep Research', 'No'],
    ]);
  });

  it('swaps every value to the chosen plan when the select changes', () => {
    render(<PlanComparisonStack rows={ROWS} columns={COLUMNS} cellValue={cellValue} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'compareStackPlanLabel' }), {
      target: { value: 'pro' },
    });

    expect(screen.getByRole('combobox')).toHaveValue('pro');
    expect(screen.queryByLabelText('Free')).toBeNull();
    expect(listedPairs('Pro')).toEqual([
      ['Price', '$20/mo'],
      ['Projects', '25 projects'],
      ['Deep Research', 'Yes'],
    ]);
  });

  it('renders nothing when there are no plans to compare', () => {
    const { container } = render(
      <PlanComparisonStack rows={[]} columns={COLUMNS} cellValue={cellValue} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
