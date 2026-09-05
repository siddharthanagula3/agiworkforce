import 'server-only';

import {
  summarizeCogs,
  summarizeCogsAccountAttribution,
  summarizeTaskEconomics,
  type CogsSummary,
  type TaskEconomics,
} from '@/lib/services/cogs-ledger-service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SHORT_WINDOW_DAYS = 7;
const LONG_WINDOW_DAYS = 30;

export const OPERATOR_COST_WINDOW_DAYS: readonly number[] = [SHORT_WINDOW_DAYS, LONG_WINDOW_DAYS];

export interface OperatorCostWindow {
  days: number;
  from: string;
  to: string;
  cogs: CogsSummary;
  tasks: TaskEconomics;
  activeAccounts: number;
  costPerActiveAccountCents: number | null;
  costWithNoAccountCents: number;
}

export interface OperatorCosts {
  windows: OperatorCostWindow[];
}

/**
 * An active account here is an account the ledger charged us money for in the
 * window, not an account that signed in. Cost per active account divided by a
 * sign-in count would flatter the number with everyone who never ran inference.
 */
async function readCostWindow(days: number, now: Date): Promise<OperatorCostWindow> {
  const from = new Date(now.getTime() - days * MS_PER_DAY);
  const [cogs, tasks, attribution] = await Promise.all([
    summarizeCogs(from, now),
    summarizeTaskEconomics(from, now),
    summarizeCogsAccountAttribution(from, now),
  ]);

  return {
    days,
    from: from.toISOString(),
    to: now.toISOString(),
    cogs,
    tasks,
    activeAccounts: attribution.activeAccounts,
    costPerActiveAccountCents:
      attribution.activeAccounts > 0
        ? attribution.attributedCostCents / attribution.activeAccounts
        : null,
    costWithNoAccountCents: attribution.unattributedCostCents,
  };
}

export async function readOperatorCosts(now: Date = new Date()): Promise<OperatorCosts> {
  return {
    windows: await Promise.all(OPERATOR_COST_WINDOW_DAYS.map((days) => readCostWindow(days, now))),
  };
}
