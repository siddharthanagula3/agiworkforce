import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlanComparisonStack } from './PlanComparisonStack';
import {
  EXCLUDED_CELL,
  INCLUDED_CELL,
  textCell,
  type PlanComparisonGroup,
  type PlanComparisonPlan,
} from './PlanComparisonValue';

type ReactI18nextModule = typeof import('react-i18next');

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<ReactI18nextModule>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

const PLANS: PlanComparisonPlan[] = [
  { planId: 'free', label: 'Free', price: '$0/month' },
  { planId: 'pro', label: 'Pro', price: '$20/month' },
  { planId: 'team', label: 'Team', price: '$25 per seat / month', billing: 'billed monthly' },
];

const GROUPS: PlanComparisonGroup[] = [
  {
    id: 'usage',
    label: 'Usage',
    rows: [
      {
        id: 'usage',
        label: 'Managed usage',
        cells: {
          free: textCell('A small allowance'),
          pro: textCell('5x more per session', '2x more weekly'),
          team: textCell('Same as Pro'),
        },
      },
    ],
  },
  {
    id: 'features',
    label: 'Features',
    rows: [
      {
        id: 'projects',
        label: 'Projects',
        cells: { free: textCell('1'), pro: textCell('25'), team: textCell('25') },
      },
      {
        id: 'research',
        label: 'Deep Research',
        note: 'Runs in the background',
        cells: { free: EXCLUDED_CELL, pro: INCLUDED_CELL, team: INCLUDED_CELL },
      },
    ],
  },
];

interface StackedGroup {
  heading: string;
  rows: Array<{ label: string; note: string | null; value: string[] }>;
}

function stackedGroups(): StackedGroup[] {
  return screen.getAllByRole('region').map((group) => ({
    heading: within(group).getByRole('heading', { level: 3 }).textContent ?? '',
    rows: [...group.querySelectorAll('.agi-compare-stack-item')].map((item) => ({
      label: item.querySelector('dt .agi-compare-row-label')?.textContent ?? '',
      note: item.querySelector('dt .agi-compare-row-note')?.textContent ?? null,
      value: [...(item.querySelector('dd .agi-compare-value')?.children ?? [])].map(
        (part) => part.textContent ?? '',
      ),
    })),
  }));
}

describe('PlanComparisonStack', () => {
  it('lists every group, row and value for the first plan, in order', () => {
    render(<PlanComparisonStack plans={PLANS} groups={GROUPS} />);

    const select = screen.getByRole('combobox', { name: 'compareStackPlanLabel' });
    expect(select).toHaveValue('free');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Free', 'Pro', 'Team']);
    expect(screen.getByText('$0/month')).toBeVisible();
    expect(stackedGroups()).toEqual([
      {
        heading: 'Usage',
        rows: [{ label: 'Managed usage', note: null, value: ['A small allowance'] }],
      },
      {
        heading: 'Features',
        rows: [
          { label: 'Projects', note: null, value: ['1'] },
          { label: 'Deep Research', note: 'Runs in the background', value: ['–', 'notIncluded'] },
        ],
      },
    ]);
    for (const group of screen.getAllByRole('region')) {
      expect(group.querySelector('dl')?.querySelectorAll('dt')).toHaveLength(
        group.querySelectorAll('dd').length,
      );
    }
  });

  it('swaps every value and the price to the chosen plan when the select changes', () => {
    render(<PlanComparisonStack plans={PLANS} groups={GROUPS} />);

    fireEvent.change(screen.getByRole('combobox', { name: 'compareStackPlanLabel' }), {
      target: { value: 'pro' },
    });

    expect(screen.getByRole('combobox')).toHaveValue('pro');
    expect(screen.queryByText('$0/month')).toBeNull();
    expect(screen.getByText('$20/month')).toBeVisible();
    const [usage, features] = stackedGroups();
    expect(usage?.rows[0]?.value).toEqual(['5x more per session', '2x more weekly']);
    expect(features?.rows.map((row) => row.value)).toEqual([['25'], ['', 'included']]);
    const included = screen.getByText('included');
    expect(included).toHaveClass('sr-only');
    expect(included.previousElementSibling).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the billing line beneath the price for a plan that has one', () => {
    render(<PlanComparisonStack plans={PLANS} groups={GROUPS} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'team' } });

    expect(
      [...document.querySelectorAll('.agi-compare-stack-price span')].map((s) => s.textContent),
    ).toEqual(['$25 per seat / month', 'billed monthly']);
  });

  it('falls back to the first plan when the chosen one leaves the list', () => {
    const { rerender } = render(<PlanComparisonStack plans={PLANS} groups={GROUPS} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'pro' } });

    rerender(<PlanComparisonStack plans={PLANS.slice(2)} groups={GROUPS} />);

    expect(screen.getByRole('combobox')).toHaveValue('team');
    expect(stackedGroups()[0]?.rows[0]?.value).toEqual(['Same as Pro']);
  });

  it('renders nothing when there are no plans to compare', () => {
    const { container } = render(<PlanComparisonStack plans={[]} groups={GROUPS} />);
    expect(container).toBeEmptyDOMElement();
  });
});
