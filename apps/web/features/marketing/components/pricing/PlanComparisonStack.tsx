'use client';

import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  PlanComparisonValue,
  type PlanComparisonGroup,
  type PlanComparisonPlan,
} from './PlanComparisonValue';

export interface PlanComparisonStackProps {
  plans: ReadonlyArray<PlanComparisonPlan>;
  groups: ReadonlyArray<PlanComparisonGroup>;
}

export function PlanComparisonStack({ plans, groups }: PlanComparisonStackProps) {
  const { t } = useTranslation('pricing');
  const selectId = useId();
  const [planId, setPlanId] = useState(plans[0]?.planId ?? '');
  const selected = plans.find((plan) => plan.planId === planId) ?? plans[0];
  if (!selected) return null;

  return (
    <div className="agi-compare-stack">
      <label className="agi-compare-stack-label" htmlFor={selectId}>
        {t('compareStackPlanLabel')}
      </label>
      <select
        id={selectId}
        className="agi-compare-stack-select"
        value={selected.planId}
        onChange={(event) => setPlanId(event.target.value)}
      >
        {plans.map((plan) => (
          <option key={plan.planId} value={plan.planId}>
            {plan.label}
          </option>
        ))}
      </select>
      <p className="agi-compare-stack-price">
        <span>{selected.price}</span>
        {selected.billing ? <span>{selected.billing}</span> : null}
      </p>
      {groups.map((group) => {
        const headingId = `${selectId}-${group.id}`;
        return (
          <section key={group.id} className="agi-compare-stack-group" aria-labelledby={headingId}>
            <h3 id={headingId} className="agi-compare-stack-heading">
              {group.label}
            </h3>
            <dl className="agi-compare-stack-list">
              {group.rows.map((row) => (
                <div key={row.id} className="agi-compare-stack-item">
                  <dt>
                    <span className="agi-compare-row-label">{row.label}</span>
                    {row.note ? <span className="agi-compare-row-note">{row.note}</span> : null}
                  </dt>
                  <dd>
                    <PlanComparisonValue cell={row.cells[selected.planId]} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
