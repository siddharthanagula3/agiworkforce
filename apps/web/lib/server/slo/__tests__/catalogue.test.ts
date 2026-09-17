import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  declaredOnlySlos,
  findSlo,
  formatObjective,
  measuredSlos,
  SLO_CATALOGUE,
} from '../catalogue';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../db/neon');

const DOMAINS_FROM_SECTION_90 = [
  'Authentication',
  'Chat',
  'First token',
  'Completion',
  'Tool execution',
  'Work',
  'Research',
  'File upload',
  'File parsing',
  'Search',
  'Remote control',
  'Browser',
  'Notifications',
  'Billing events',
];

function migrationCorpus(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .map((name) => readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8'))
    .join('\n');
}

describe('SLO catalogue', () => {
  it('covers every service-level domain exactly once', () => {
    expect(SLO_CATALOGUE.map((slo) => slo.domain)).toEqual(DOMAINS_FROM_SECTION_90);
    expect(new Set(SLO_CATALOGUE.map((slo) => slo.id)).size).toBe(SLO_CATALOGUE.length);
  });

  it('states an objective strictly between zero and one for every domain', () => {
    for (const slo of SLO_CATALOGUE) {
      expect(slo.objective).toBeGreaterThan(0);
      expect(slo.objective).toBeLessThan(1);
      expect(slo.windowDays).toBeGreaterThan(0);
      expect(slo.statement.length).toBeGreaterThan(0);
    }
  });

  it('measures every domain from a table that exists, or names the missing instrument', () => {
    const migrations = migrationCorpus();
    for (const slo of SLO_CATALOGUE) {
      if (slo.source) {
        expect(migrations).toContain(`create table if not exists public.${slo.source.table} (`);
        expect(slo.source.coverage.length).toBeGreaterThan(0);
        expect(slo.missingInstrument).toBeUndefined();
      } else {
        expect(slo.missingInstrument?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  it('gives every latency indicator a deadline and a column to measure it on', () => {
    for (const slo of SLO_CATALOGUE) {
      if (slo.kind !== 'latency') continue;
      expect(slo.thresholdMs).toBeGreaterThan(0);
      expect(slo.source?.latencyMs).toBeTruthy();
      expect(slo.source?.good).toContain('$3');
    }
  });

  it('keeps a threshold parameter out of every availability indicator', () => {
    for (const slo of SLO_CATALOGUE) {
      if (slo.kind === 'latency') continue;
      expect(slo.thresholdMs).toBeUndefined();
      expect(slo.source?.good ?? '').not.toContain('$3');
    }
  });

  it('splits the catalogue into what is measured and what is only declared', () => {
    expect(measuredSlos().length + declaredOnlySlos().length).toBe(SLO_CATALOGUE.length);
    expect(declaredOnlySlos().map((slo) => slo.id)).toEqual([
      'authentication',
      'search',
      'notifications',
    ]);
  });

  it('finds a definition by id', () => {
    expect(findSlo('chat')?.domain).toBe('Chat');
    expect(findSlo('nothing-here')).toBeUndefined();
  });

  it('formats an objective without trailing zeroes', () => {
    expect(formatObjective(0.999)).toBe('99.9%');
    expect(formatObjective(0.99)).toBe('99%');
    expect(formatObjective(0.95)).toBe('95%');
  });
});
