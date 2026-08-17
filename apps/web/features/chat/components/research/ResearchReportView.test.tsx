import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ResearchReport } from '@agiworkforce/types';

import {
  ResearchReportView,
  researchReportFilename,
  researchReportFollowUpPrompt,
  researchReportToMarkdown,
} from './ResearchReportView';

function makeReport(overrides: Partial<ResearchReport> = {}): ResearchReport {
  return {
    id: 'report-1',
    queryId: 'req-1',
    title: 'Node.js release status',
    summary: 'Node 24 is the active LTS line.',
    content: '## Overview\n\nNode 24 is LTS [1]. Node 26 is Current [2].',
    citations: [
      {
        id: '1',
        title: 'nodejs.org releases',
        url: 'https://nodejs.org/en/about/previous-releases',
        accessedAt: '2026-08-05T10:00:00.000Z',
      },
      {
        id: '2',
        title: 'Node blog',
        url: 'https://nodejs.org/en/blog',
        accessedAt: '2026-08-05T10:00:00.000Z',
      },
    ],
    keyFindings: ['v24.18.0 is LTS', 'v26.5.0 is Current'],
    status: 'completed',
    sourcesConsulted: 2,
    totalDurationMs: 45_000,
    createdAt: '2026-08-05T10:00:00.000Z',
    completedAt: '2026-08-05T10:00:45.000Z',
    ...overrides,
  };
}

describe('researchReportToMarkdown', () => {
  it('assembles title, summary, findings, body, and numbered sources', () => {
    const markdown = researchReportToMarkdown(makeReport());
    expect(markdown).toContain('# Node.js release status');
    expect(markdown).toContain('Node 24 is the active LTS line.');
    expect(markdown).toContain('## Key findings\n- v24.18.0 is LTS\n- v26.5.0 is Current');
    expect(markdown).toContain('## Overview');
    expect(markdown).toContain(
      '## Sources\n1. [nodejs.org releases](https://nodejs.org/en/about/previous-releases)',
    );
  });

  it('omits sections the report does not have instead of emitting empty ones', () => {
    const markdown = researchReportToMarkdown(
      makeReport({ summary: '', keyFindings: [], citations: [] }),
    );
    expect(markdown).not.toContain('## Key findings');
    expect(markdown).not.toContain('## Sources');
  });
});

describe('researchReportFilename', () => {
  it('slugifies the report title and falls back when it is empty', () => {
    expect(researchReportFilename(makeReport())).toBe('node-js-release-status');
    expect(researchReportFilename(makeReport({ title: '   ' }))).toBe('research-report');
  });
});

describe('ResearchReportView', () => {
  it('renders the report title, findings, content, and citation list', () => {
    render(<ResearchReportView report={makeReport()} />);

    expect(screen.getByRole('heading', { name: 'Node.js release status' })).toBeInTheDocument();
    expect(screen.getByText('Node 24 is the active LTS line.')).toBeInTheDocument();
    expect(screen.getByText('v24.18.0 is LTS')).toBeInTheDocument();
    expect(screen.getByTestId('research-report-content')).toHaveTextContent('Node 24 is LTS [1]');
    // Regression: the body was rendered with `whitespace-pre-wrap`, so a saved
    // report showed literal markdown syntax instead of formatting.
    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByTestId('research-report-content')).not.toHaveTextContent('## Overview');
    expect(screen.getByText('nodejs.org releases')).toBeInTheDocument();
    expect(screen.getByText('2 sources · 45s')).toBeInTheDocument();
  });

  it('renders a favicon per citation, matching the Sources tab', () => {
    const { container } = render(<ResearchReportView report={makeReport()} />);

    const favicons = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(favicons).toEqual([
      'https://www.google.com/s2/favicons?domain=nodejs.org&sz=32',
      'https://www.google.com/s2/favicons?domain=nodejs.org&sz=32',
    ]);
  });

  it('falls back to the globe placeholder when a citation url is not a url', () => {
    const { container } = render(
      <ResearchReportView
        report={makeReport({
          citations: [
            {
              id: '1',
              title: 'A source with no parseable url',
              url: 'not-a-url',
              accessedAt: '2026-08-05T10:00:00.000Z',
            },
          ],
        })}
      />,
    );

    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(screen.getByText('A source with no parseable url')).toBeInTheDocument();
  });

  it('invokes the existing export service with the assembled markdown', async () => {
    const exportDocument = vi.fn().mockResolvedValue(undefined);
    const report = makeReport();
    render(<ResearchReportView report={report} exportService={{ exportDocument }} />);

    await userEvent.click(screen.getByTestId('research-report-export-markdown'));

    await waitFor(() => expect(exportDocument).toHaveBeenCalledTimes(1));
    expect(exportDocument).toHaveBeenCalledWith(
      researchReportToMarkdown(report),
      'markdown',
      'node-js-release-status',
      expect.objectContaining({
        title: 'Node.js release status',
        metadata: expect.objectContaining({ status: 'completed', sources: '2' }),
      }),
    );
  });

  it('offers the other formats the shared service already supports', async () => {
    const exportDocument = vi.fn().mockResolvedValue(undefined);
    render(<ResearchReportView report={makeReport()} exportService={{ exportDocument }} />);

    await userEvent.click(screen.getByTestId('research-report-export-pdf'));

    await waitFor(() => expect(exportDocument).toHaveBeenCalledTimes(1));
    expect(exportDocument.mock.calls[0]?.[1]).toBe('pdf');
  });

  it('surfaces an export failure instead of swallowing it', async () => {
    const exportDocument = vi.fn().mockRejectedValue(new Error('disk full'));
    render(<ResearchReportView report={makeReport()} exportService={{ exportDocument }} />);

    await userEvent.click(screen.getByTestId('research-report-export-markdown'));

    expect(await screen.findByRole('alert')).toHaveTextContent('disk full');
  });

  it('flags an interrupted report with its honest error text', () => {
    render(
      <ResearchReportView
        report={makeReport({ status: 'interrupted', error: 'Research was cancelled.' })}
      />,
    );

    expect(screen.getByText(/interrupted/)).toBeInTheDocument();
    expect(screen.getByText(/Research was cancelled\./)).toBeInTheDocument();
  });

  it('renders nothing for sections the report lacks', () => {
    render(<ResearchReportView report={makeReport({ keyFindings: [], citations: [] })} />);

    expect(screen.queryByText('Key findings')).not.toBeInTheDocument();
    expect(screen.queryByText('Sources')).not.toBeInTheDocument();
  });
});

describe('ResearchReportView follow-up', () => {
  it('renders no composer when the host cannot send the question anywhere', () => {
    render(<ResearchReportView report={makeReport()} />);

    expect(screen.queryByTestId('research-report-follow-up')).toBeNull();
  });

  it('sends the question with the report carried along as grounding', async () => {
    const onAskFollowUp = vi.fn();
    render(<ResearchReportView report={makeReport()} onAskFollowUp={onAskFollowUp} />);

    await userEvent.type(
      screen.getByLabelText('Ask a follow-up about this report'),
      'Which line should we pin?',
    );
    await userEvent.click(screen.getByTestId('research-report-follow-up-send'));

    expect(onAskFollowUp).toHaveBeenCalledTimes(1);
    const prompt = onAskFollowUp.mock.calls[0]![0] as string;
    expect(prompt).toContain('Which line should we pin?');
    expect(prompt).toContain('Node 24 is LTS [1]');
    expect(prompt).toContain('https://nodejs.org/en/about/previous-releases');
  });

  it('refuses to send an empty question', async () => {
    const onAskFollowUp = vi.fn();
    render(<ResearchReportView report={makeReport()} onAskFollowUp={onAskFollowUp} />);

    expect(screen.getByTestId('research-report-follow-up-send')).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Ask a follow-up about this report'), '   {Enter}');
    expect(onAskFollowUp).not.toHaveBeenCalled();
  });
});

describe('researchReportFollowUpPrompt', () => {
  it('declares the cut when the report is too long to carry whole', () => {
    const prompt = researchReportFollowUpPrompt(
      makeReport({ content: 'x'.repeat(9_000) }),
      'and then?',
    );
    expect(prompt).toContain('[report truncated after 8000 characters]');
    expect(prompt).toContain('and then?');
  });
});
