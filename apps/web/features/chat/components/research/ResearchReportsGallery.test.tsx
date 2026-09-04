/**
 * The gallery is the FIRST call site in the repo for `GET
 * /api/research/reports` without a `conversationId`, the "newest reports for
 * the caller" branch the endpoint always had and nothing ever reached. These
 * tests pin that request shape, because losing it silently turns the gallery
 * back into a per-conversation view.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ResearchReport } from '@agiworkforce/types';

import { ResearchReportsGallery } from './ResearchReportsGallery';

function makeReport(overrides: Partial<ResearchReport> & { query?: string } = {}) {
  return {
    id: 'report-1',
    queryId: 'req-1',
    title: 'Node.js release status',
    summary: 'Node 24 is the active LTS line.',
    content: '## Overview\n\nNode 24 is LTS [1].',
    citations: [
      {
        id: '1',
        title: 'nodejs.org releases',
        url: 'https://nodejs.org/en/about/previous-releases',
        accessedAt: '2026-08-05T10:00:00.000Z',
      },
    ],
    status: 'completed' as const,
    sourcesConsulted: 1,
    createdAt: '2026-08-05T10:00:00.000Z',
    completedAt: '2026-08-05T10:00:45.000Z',
    ...overrides,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function respondWith(reports: unknown[]) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ reports }),
  });
}

describe('ResearchReportsGallery', () => {
  it('asks the reports endpoint for every report the caller owns, not one conversation', async () => {
    respondWith([makeReport()]);

    render(<ResearchReportsGallery />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/research/reports');
    // The whole point of the gallery: no conversation scope.
    expect(url).not.toContain('conversationId');
    expect(init.credentials).toBe('same-origin');
  });

  it('lists the returned reports and opens one in the report view', async () => {
    respondWith([
      makeReport(),
      makeReport({
        id: 'report-2',
        title: '',
        query: 'how did the pricing change land?',
        status: 'interrupted',
        sourcesConsulted: 3,
        createdAt: '2026-08-04T09:00:00.000Z',
      }),
    ]);

    render(<ResearchReportsGallery />);

    expect(await screen.findByText('Node.js release status')).toBeInTheDocument();
    // A report with no synthesized title falls back to the question it started
    // from rather than rendering a blank row.
    expect(screen.getByText('how did the pricing change land?')).toBeInTheDocument();
    expect(screen.getByText('interrupted')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Node.js release status'));

    expect(await screen.findByTestId('research-report-view')).toBeInTheDocument();
    expect(screen.getByTestId('research-report-content')).toHaveTextContent('Node 24 is LTS');
    // No second request: the list response already carried the full body.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByText('All reports'));
    expect(screen.queryByTestId('research-report-view')).not.toBeInTheDocument();
    expect(screen.getByTestId('research-reports-gallery')).toBeInTheDocument();
  });

  it('shows an honest empty state instead of inventing rows', async () => {
    respondWith([]);

    render(<ResearchReportsGallery />);

    expect(await screen.findByText('No reports yet')).toBeInTheDocument();
    expect(screen.queryByTestId('research-reports-gallery')).not.toBeInTheDocument();
  });

  it('surfaces a failed read instead of rendering an empty gallery', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

    render(<ResearchReportsGallery />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load reports (500)');
    expect(screen.queryByText('No reports yet')).not.toBeInTheDocument();
  });
});
