import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { PersistedResearchReport } from '@/lib/services/research-report-service';
import { buildPersistedTurnResearch } from './assistant-turn-research';

const REPORT = {
  id: 'report-1',
  queryId: 'agi.chat.web.send.turn-1',
  requestId: 'agi.chat.web.send.turn-1',
  userId: 'user-1',
  query: 'What changed?',
  title: 'What changed',
  summary: 'Things changed.',
  content: 'Body.',
  citations: [],
  steps: [],
  status: 'completed',
  sourcesConsulted: 7,
  totalDurationMs: 45_000,
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T00:00:45.000Z',
} as unknown as PersistedResearchReport;

describe('buildPersistedTurnResearch', () => {
  it('carries the run settlement through as credits', () => {
    const research = buildPersistedTurnResearch(REPORT, { settledCostMicrousd: 240_000 });

    expect(research.credits).toBe(12);
  });

  it('falls back to the amount already stored on the report', () => {
    const research = buildPersistedTurnResearch({ ...REPORT, settledCostMicrousd: 100_000 });

    expect(research.credits).toBe(5);
  });

  it('leaves credits absent when the run was never settled', () => {
    expect(buildPersistedTurnResearch(REPORT).credits).toBeUndefined();
  });
});
