'use client';

import {
  PlanComparisonValue,
  type PlanComparisonGroup,
  type PlanComparisonPlan,
} from './PlanComparisonValue';

export interface PlanComparisonTableProps {
  labelledBy: string;
  plans: ReadonlyArray<PlanComparisonPlan>;
  groups: ReadonlyArray<PlanComparisonGroup>;
}

export function PlanComparisonTable({ labelledBy, plans, groups }: PlanComparisonTableProps) {
  if (plans.length === 0) return null;

  return (
    <table aria-labelledby={labelledBy} className="agi-compare-table">
      <thead>
        <tr>
          <td />
          {plans.map((plan) => (
            <th key={plan.planId} scope="col">
              <span className="agi-compare-plan-name">{plan.label}</span>
              <span className="agi-compare-plan-price">{plan.price}</span>
              {plan.billing ? <span className="agi-compare-plan-price">{plan.billing}</span> : null}
            </th>
          ))}
        </tr>
      </thead>
      {groups.map((group) => (
        <tbody key={group.id}>
          <tr className="agi-compare-group">
            <th scope="rowgroup" colSpan={plans.length + 1}>
              {group.label}
            </th>
          </tr>
          {group.rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">
                <span className="agi-compare-row-label">{row.label}</span>
                {row.note ? <span className="agi-compare-row-note">{row.note}</span> : null}
              </th>
              {plans.map((plan) => (
                <td key={plan.planId}>
                  <PlanComparisonValue cell={row.cells[plan.planId]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}
