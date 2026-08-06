import { describe, expect, it } from 'vitest';

import {
  RESEARCH_REPORT_STATUSES,
  RESEARCH_STEP_STATUSES,
  RESEARCH_STEP_TYPES,
  isResearchReportStatus,
  isResearchStep,
  type ResearchReport,
  type ResearchStep,
} from '../research';

const step: ResearchStep = {
  id: 'step-1',
  type: 'search',
  description: 'Search for 2026 pricing changes',
  status: 'pending',
};

describe('research report status', () => {
  it('enumerates every lifecycle status including interrupted', () => {
    expect(RESEARCH_REPORT_STATUSES).toEqual([
      'pending',
      'researching',
      'synthesizing',
      'completed',
      'interrupted',
      'failed',
    ]);
  });

  it('accepts every enumerated status', () => {
    for (const status of RESEARCH_REPORT_STATUSES) {
      expect(isResearchReportStatus(status)).toBe(true);
    }
  });

  it('rejects unknown, empty, and non-string values', () => {
    expect(isResearchReportStatus('cancelled')).toBe(false);
    expect(isResearchReportStatus('')).toBe(false);
    expect(isResearchReportStatus(undefined)).toBe(false);
    expect(isResearchReportStatus(null)).toBe(false);
    expect(isResearchReportStatus(3)).toBe(false);
    expect(isResearchReportStatus({ status: 'completed' })).toBe(false);
  });
});

describe('isResearchStep', () => {
  it('accepts a well-formed step in every declared type and status', () => {
    for (const type of RESEARCH_STEP_TYPES) {
      for (const status of RESEARCH_STEP_STATUSES) {
        expect(isResearchStep({ ...step, type, status })).toBe(true);
      }
    }
  });

  it('accepts optional timing and source fields', () => {
    expect(
      isResearchStep({
        ...step,
        status: 'completed',
        durationMs: 1200,
        sourcesConsulted: 4,
        startedAt: '2026-08-05T10:00:00.000Z',
        completedAt: '2026-08-05T10:00:01.200Z',
      }),
    ).toBe(true);
  });

  it('rejects malformed entries instead of throwing', () => {
    expect(isResearchStep(null)).toBe(false);
    expect(isResearchStep('step-1')).toBe(false);
    expect(isResearchStep({ ...step, id: '' })).toBe(false);
    expect(isResearchStep({ ...step, type: 'browse' })).toBe(false);
    expect(isResearchStep({ ...step, status: 'queued' })).toBe(false);
    expect(isResearchStep({ ...step, description: 42 })).toBe(false);
  });
});

describe('ResearchReport shape', () => {
  it('carries run linkage fields alongside the report body', () => {
    const report: ResearchReport = {
      id: 'report-1',
      queryId: 'req-1',
      title: 'Pricing changes',
      summary: 'Prices rose.',
      content: '## Overview\n\nPrices rose [1].',
      citations: [
        {
          id: '1',
          title: 'Source A',
          url: 'https://example.com/a',
          accessedAt: '2026-08-05T10:00:00.000Z',
        },
      ],
      steps: [step],
      status: 'interrupted',
      sourcesConsulted: 1,
      totalDurationMs: 5_000,
      createdAt: '2026-08-05T10:00:00.000Z',
      userId: 'user-1',
      conversationId: 'conv-1',
      requestId: 'req-1',
    };

    expect(report.status).toBe('interrupted');
    expect(isResearchReportStatus(report.status)).toBe(true);
    expect(report.citations[0]?.url).toBe('https://example.com/a');
  });
});
