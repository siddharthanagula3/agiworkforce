import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  toolAcceptanceRate,
  type OrganizationActivityDay,
  type OrganizationToolDecisions,
} from '@agiworkforce/types';

import { num } from '@/lib/services/usage-aggregation';

interface SessionDayRow {
  day: string | Date;
  sessions: string | number | null;
}

interface DecisionDayRow {
  day: string | Date;
  accepted: string | number | null;
  rejected: string | number | null;
}

function dayKey(value: string | Date): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

async function readToolDecisionDays(
  db: DatabaseAdapter,
  organizationId: string,
  window: { from: string; to: string },
): Promise<DecisionDayRow[]> {
  return db.query<DecisionDayRow>(
    `select day, accepted, rejected
       from public.app_org_code_tool_decision_days($1::uuid, $2::timestamptz, $3::timestamptz)`,
    [organizationId, window.from, window.to],
  );
}

async function readCodeSessionDays(
  db: DatabaseAdapter,
  organizationId: string,
  window: { from: string; to: string },
): Promise<SessionDayRow[]> {
  return db.query<SessionDayRow>(
    `select day, sessions
       from public.app_org_code_session_days($1::uuid, $2::timestamptz, $3::timestamptz)`,
    [organizationId, window.from, window.to],
  );
}

export async function readOrganizationActivityDays(
  db: DatabaseAdapter,
  organizationId: string,
  window: { from: string; to: string },
): Promise<OrganizationActivityDay[]> {
  const [sessionRows, decisionRows] = await Promise.all([
    readCodeSessionDays(db, organizationId, window),
    readToolDecisionDays(db, organizationId, window),
  ]);

  const days = new Map<
    string,
    { codeSessions: number; toolDecisions: OrganizationToolDecisions }
  >();
  const entry = (day: string) => {
    const existing = days.get(day);
    if (existing) return existing;
    const created = { codeSessions: 0, toolDecisions: { accepted: 0, rejected: 0 } };
    days.set(day, created);
    return created;
  };
  for (const row of sessionRows) entry(dayKey(row.day)).codeSessions = num(row.sessions);
  for (const row of decisionRows) {
    entry(dayKey(row.day)).toolDecisions = {
      accepted: num(row.accepted),
      rejected: num(row.rejected),
    };
  }

  return [...days.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, value]) => ({
      day,
      codeSessions: value.codeSessions,
      toolDecisions: value.toolDecisions,
      toolAcceptanceRate: toolAcceptanceRate(value.toolDecisions),
    }));
}
