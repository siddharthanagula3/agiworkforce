import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlanComparisonTable } from './PlanComparisonTable';
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
        cells: { free: textCell('A small allowance'), team: textCell('Per session', 'Weekly') },
      },
    ],
  },
  {
    id: 'models',
    label: 'Models',
    rows: [
      {
        id: 'fast',
        label: 'Fast models',
        note: 'Model A, Model B',
        cells: { free: EXCLUDED_CELL, team: INCLUDED_CELL },
      },
      { id: 'unlisted', label: 'Flagship models', cells: { team: INCLUDED_CELL } },
    ],
  },
];

function renderTable(plans = PLANS) {
  render(
    <>
      <h2 id="compare-title">Compare plans</h2>
      <PlanComparisonTable labelledBy="compare-title" plans={plans} groups={GROUPS} />
    </>,
  );
  return screen.getByRole('table', { name: 'Compare plans' });
}

describe('PlanComparisonTable', () => {
  it('heads one column per plan with its price and billing line beneath the name', () => {
    const table = renderTable();

    const headers = [...table.querySelectorAll('thead th')];
    expect(headers).toHaveLength(PLANS.length);
    for (const header of headers) expect(header).toHaveAttribute('scope', 'col');
    expect(headers.map((header) => [...header.children].map((line) => line.textContent))).toEqual([
      ['Free', '$0/month'],
      ['Team', '$25 per seat / month', 'billed monthly'],
    ]);
    expect(table.querySelector('thead tr')?.children).toHaveLength(PLANS.length + 1);
    expect(table.querySelector('thead tr')?.firstElementChild?.tagName).toBe('TD');
    expect(within(table).queryAllByRole('button')).toHaveLength(0);
    expect(within(table).queryAllByRole('link')).toHaveLength(0);
  });

  it('groups capability rows under a heading that spans every column', () => {
    const table = renderTable();

    const bodies = [...table.querySelectorAll('tbody')];
    expect(bodies).toHaveLength(GROUPS.length);
    bodies.forEach((body, index) => {
      const heading = body.querySelector('tr.agi-compare-group th');
      expect(heading).toHaveTextContent(GROUPS[index]!.label);
      expect(heading).toHaveAttribute('scope', 'rowgroup');
      expect(heading).toHaveAttribute('colspan', String(PLANS.length + 1));
      expect(body.firstElementChild).toHaveClass('agi-compare-group');
      const rows = [...body.querySelectorAll('tr:not(.agi-compare-group)')];
      expect(
        rows.map((row) => row.querySelector('th .agi-compare-row-label')?.textContent),
      ).toEqual(GROUPS[index]!.rows.map((row) => row.label));
      for (const row of rows) {
        expect(row.firstElementChild).toHaveAttribute('scope', 'row');
        expect(row.querySelectorAll('td')).toHaveLength(PLANS.length);
      }
    });
  });

  it('draws a check, a dash or text per cell and names the first two for a screen reader', () => {
    const table = renderTable();
    const rowOf = (label: string) =>
      within(table).getByText(label).closest('tr') as HTMLTableRowElement;

    const [usageFree, usageTeam] = [...rowOf('Managed usage').querySelectorAll('td')];
    expect(usageFree).toHaveTextContent('A small allowance');
    expect(
      [...(usageTeam?.querySelector('.agi-compare-value')?.children ?? [])].map(
        (line) => line.textContent,
      ),
    ).toEqual(['Per session', 'Weekly']);

    const fast = rowOf('Fast models');
    expect(fast.querySelector('th .agi-compare-row-note')).toHaveTextContent('Model A, Model B');
    const [fastFree, fastTeam] = [...fast.querySelectorAll('td')];
    expect(fastFree?.querySelector('[aria-hidden="true"]')).toHaveTextContent('–');
    expect(fastFree?.querySelector('.sr-only')).toHaveTextContent('notIncluded');
    expect(fastFree?.querySelector('svg')).toBeNull();
    expect(fastTeam?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(fastTeam?.querySelector('.sr-only')).toHaveTextContent('included');

    expect(rowOf('Managed usage').querySelector('th .agi-compare-row-note')).toBeNull();
  });

  it('marks a plan the row says nothing about as not included', () => {
    const table = renderTable();
    const [free, team] = [
      ...(within(table).getByText('Flagship models').closest('tr')?.querySelectorAll('td') ?? []),
    ];

    expect(free?.querySelector('.sr-only')).toHaveTextContent('notIncluded');
    expect(team?.querySelector('.sr-only')).toHaveTextContent('included');
  });

  it('renders nothing when there are no plans to compare', () => {
    render(<PlanComparisonTable labelledBy="compare-title" plans={[]} groups={GROUPS} />);
    expect(screen.queryByRole('table')).toBeNull();
  });
});
