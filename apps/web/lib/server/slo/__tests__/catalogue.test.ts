import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  alertableSlos,
  declaredOnlySlos,
  findSlo,
  formatObjective,
  measuredSlos,
  publishedSlos,
  segmentableSlos,
  segmentColumn,
  segmentsOf,
  SLO_CATALOGUE,
  SLO_SEGMENTS,
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
    .join('\n')
    .toLowerCase();
}

describe('SLO catalogue', () => {
  it('covers every service-level domain exactly once', () => {
    expect(publishedSlos().map((slo) => slo.domain)).toEqual(DOMAINS_FROM_SECTION_90);
    expect(new Set(SLO_CATALOGUE.map((slo) => slo.id)).size).toBe(SLO_CATALOGUE.length);
  });

  it('publishes nothing §90 does not promise, while alerting on more than it', () => {
    const published = new Set(publishedSlos().map((slo) => slo.id));
    const alertable = alertableSlos().map((slo) => slo.id);
    expect(alertable).toContain('billing-usage');
    expect(alertable).toContain('entitlement-activation');
    expect(published.has('billing-usage')).toBe(false);
    expect(published.has('entitlement-activation')).toBe(false);
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
        expect(migrations).toContain(
          `create table if not exists public.${slo.source.table} (`.toLowerCase(),
        );
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
    expect(measuredSlos().length + declaredOnlySlos().length).toBe(publishedSlos().length);
    expect(declaredOnlySlos().map((slo) => slo.id)).toEqual(['notifications']);
  });

  it('measures Login and Search rather than declaring them', () => {
    for (const id of ['authentication', 'search']) {
      const slo = findSlo(id);
      expect(slo?.source).not.toBeNull();
      expect(slo?.missingInstrument).toBeUndefined();
      expect(slo?.source?.good.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('keeps a refused credential out of the authentication denominator', () => {
    const source = findSlo('authentication')?.source;

    expect(source?.eligible).toContain('succeeded');
    expect(source?.eligible).toContain('failed');
    expect(source?.eligible).not.toContain('rejected');
    expect(source?.coverage.toLowerCase()).toContain('rejected');
  });

  it('separates a search that failed from a search that matched nothing', () => {
    const source = findSlo('search')?.source;

    expect(source?.table).toBe('search_history');
    expect(source?.eligible).toBe('outcome is not null');
    expect(source?.good).toContain('succeeded');
  });

  it('segments the routed objectives by region, provider and model', () => {
    for (const id of ['chat', 'first-token', 'completion']) {
      const slo = findSlo(id);
      expect(segmentsOf(slo!)).toEqual(SLO_SEGMENTS);
      expect(segmentColumn(slo!, 'model')).toBe('model_key');
      expect(segmentColumn(slo!, 'provider')).toBe('provider');
      expect(segmentColumn(slo!, 'region')).toBe('region');
    }
  });

  it('segments Login and Search by the dimensions their rows carry', () => {
    for (const id of ['authentication', 'search']) {
      expect(segmentsOf(findSlo(id)!)).toEqual(['region', 'provider']);
      expect(segmentColumn(findSlo(id)!, 'model')).toBeUndefined();
    }
  });

  it('never claims a segment for an indicator whose table has no such column', () => {
    const migrations = migrationCorpus();
    for (const slo of SLO_CATALOGUE) {
      for (const segment of segmentsOf(slo)) {
        const column = segmentColumn(slo, segment);
        expect(column).toBeTruthy();
        expect(migrations).toContain(column!.toLowerCase());
      }
    }
    expect(segmentsOf(findSlo('work')!)).toEqual([]);
  });

  it('lists the indicators a given segment can split', () => {
    expect(segmentableSlos('model').map((slo) => slo.id)).toEqual([
      'chat',
      'first-token',
      'completion',
    ]);
    expect(segmentableSlos('region').map((slo) => slo.id)).toContain('authentication');
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
