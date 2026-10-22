import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { logger } from '@/lib/logger';

interface SkillInstallTotalRow {
  skill_name: string;
  installs: string | number;
}

export async function readSkillInstallTotals(
  db: DatabaseAdapter,
  names: readonly string[],
): Promise<ReadonlyMap<string, number>> {
  if (names.length === 0) return new Map();
  try {
    const rows = await db.query<SkillInstallTotalRow>(
      'select skill_name, installs from public.skill_install_totals($1::text[])',
      [[...new Set(names)]],
    );
    const totals = new Map<string, number>();
    for (const row of rows) {
      const installs = Number(row.installs);
      if (Number.isSafeInteger(installs) && installs > 0) totals.set(row.skill_name, installs);
    }
    return totals;
  } catch (error) {
    logger.warn({ error }, 'Skill install totals unavailable');
    return new Map();
  }
}
