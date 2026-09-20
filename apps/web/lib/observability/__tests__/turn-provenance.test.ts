import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  beginOperation,
  formatOperationReplayRef,
  newRequestId,
  parseOperationReplayRef,
} from '@/lib/identity/operation-identity';
import { SLO_CATALOGUE } from '@/lib/server/slo/catalogue';
import { dashboardPanels } from '../dashboards';

const repoRoot = resolve(import.meta.dirname, '../../../../..');
const migrationsDir = join(repoRoot, 'apps/web/db/neon');

/** Every column the SQL migrations ever add to one table, in file order. */
function columnsOf(table: string): Set<string> {
  const columns = new Set<string>();
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const createPattern = new RegExp(
    `create table if not exists public\\.${table}\\s*\\(([\\s\\S]*?)\\n\\);`,
    'iu',
  );
  const alterPattern = new RegExp(
    `alter table (?:if exists )?public\\.${table}\\b([\\s\\S]*?);`,
    'giu',
  );
  for (const name of files) {
    const source = readFileSync(join(migrationsDir, name), 'utf8');
    const created = createPattern.exec(source)?.[1];
    if (created) {
      for (const line of created.split('\n')) {
        const column = /^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s/u.exec(line)?.[1]?.toLowerCase();
        if (column && column !== 'constraint' && column !== 'check') columns.add(column);
      }
    }
    for (const match of source.matchAll(alterPattern)) {
      for (const added of (match[1] ?? '').matchAll(
        /add column (?:if not exists )?([A-Za-z_][A-Za-z0-9_]*)/giu,
      )) {
        if (added[1]) columns.add(added[1].toLowerCase());
      }
    }
  }
  return columns;
}

const TURN_TRACE = 'routing_decision_traces';
const COST_EVENTS = 'provider_cost_events';

describe('the turn trace answers what was served, when and by what build', () => {
  it('dates every row and stamps the prompt and flag versions on it', () => {
    const columns = columnsOf(TURN_TRACE);
    for (const column of ['created_at', 'completed_at', 'prompt_ids', 'flag_variants']) {
      expect(columns, `${TURN_TRACE} has no ${column}`).toContain(column);
    }
  });

  it('ties latency and cost to the model, provider and route that produced them', () => {
    const columns = columnsOf(TURN_TRACE);
    for (const column of [
      'request_id',
      'model_key',
      'provider',
      'route_id',
      'surface',
      'outcome',
      'ttft_ms',
      'duration_ms',
      'provider_cost_microusd',
    ]) {
      expect(columns, `${TURN_TRACE} has no ${column}`).toContain(column);
    }
  });

  it('keeps a served turn apart from a shadow one and writes each once', () => {
    const source = readFileSync(join(migrationsDir, '0212_routing_decision_traces.sql'), 'utf8');
    expect(source).toContain("kind = any (array['served', 'shadow'])");
    expect(source).toMatch(/unique \(request_id, kind\)/u);
  });

  it('dates every cost row and points it back at one request', () => {
    const columns = columnsOf(COST_EVENTS);
    for (const column of [
      'occurred_at',
      'source_ref',
      'provider',
      'model',
      'units',
      'unit_basis',
      'provider_cost_cents',
      'prompt_ids',
    ]) {
      expect(columns, `${COST_EVENTS} has no ${column}`).toContain(column);
    }
  });

  it('refuses two cost rows for one request', () => {
    const source = readFileSync(join(migrationsDir, '0127_cogs_ledger.sql'), 'utf8');
    expect(source).toMatch(/create unique index[\s\S]*?idx_provider_cost_events_source_ref/u);
    expect(source).toContain('source_ref text not null');
  });
});

describe('every measured objective reads a dated source', () => {
  it('names an occurredAt column for every indicator it can compute', () => {
    const measured = SLO_CATALOGUE.filter((slo) => slo.source !== null);
    expect(measured.length).toBeGreaterThan(0);
    for (const slo of measured) {
      const source = slo.source as NonNullable<typeof slo.source>;
      expect(source.occurredAt.trim().length, slo.id).toBeGreaterThan(0);
      expect(columnsOf(source.table), `${slo.id} reads ${source.table}`).toContain(
        source.occurredAt,
      );
    }
  });

  it('says what instrument is missing whenever it cannot compute one', () => {
    for (const slo of SLO_CATALOGUE.filter((entry) => entry.source === null)) {
      expect((slo.missingInstrument ?? '').trim().length, slo.id).toBeGreaterThan(40);
    }
  });

  it('splits a latency objective along the route that served it', () => {
    for (const slo of SLO_CATALOGUE) {
      if (slo.kind !== 'latency' || slo.source === null) continue;
      expect(slo.source.latencyMs, slo.id).toBeDefined();
      expect(slo.thresholdMs, slo.id).toBeGreaterThan(0);
    }
  });
});

describe('a regression can be reproduced from what a reporter can quote', () => {
  it('names one attempt exactly and carries nothing else', () => {
    const identity = beginOperation({ requestId: newRequestId() });
    const ref = formatOperationReplayRef(identity);

    expect(parseOperationReplayRef(ref)).toEqual({
      version: 1,
      requestId: identity.requestId,
      operationId: identity.operationId,
      attemptId: identity.attemptId,
    });
    expect(ref.split(':')).toHaveLength(4);
    expect(parseOperationReplayRef('2:req_a:op_b:att_c')).toBeNull();
    expect(parseOperationReplayRef('1:req_a:not-an-id:att_c')).toBeNull();
  });

  it('gives an operator a release dimension on the latency and cost panels', () => {
    const byId = new Map(dashboardPanels().map((panel) => [panel.id, panel]));
    for (const id of [
      'ttft-p95-by-release',
      'turn-cost-p50-by-release',
      'false-success-by-release',
    ]) {
      const panel = byId.get(id);
      expect(panel, `${id} has no panel`).toBeDefined();
      expect(panel?.groupBy, id).toContain('service_version');
    }
  });
});
