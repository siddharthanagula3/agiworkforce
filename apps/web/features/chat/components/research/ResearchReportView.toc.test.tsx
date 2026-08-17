import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ResearchReport } from '@agiworkforce/types';

import {
  ResearchReportView,
  extractMarkdownHeadings,
  researchReportToArtifact,
} from './ResearchReportView';

const BODY = [
  '## Overview',
  '',
  'Node 24 is LTS [1].',
  '',
  '### Release cadence',
  '',
  '```md',
  '# not a heading, it is inside a fence',
  '```',
  '',
  '## Risks',
  '',
  'Nothing alarming.',
].join('\n');

function makeReport(overrides: Partial<ResearchReport> = {}): ResearchReport {
  return {
    id: 'report-1',
    queryId: 'req-1',
    title: 'Node.js release status',
    summary: 'Node 24 is the active LTS line.',
    content: BODY,
    citations: [],
    keyFindings: [],
    status: 'completed',
    sourcesConsulted: 2,
    createdAt: '2026-08-05T10:00:00.000Z',
    ...overrides,
  };
}

describe('extractMarkdownHeadings', () => {
  it('reads headings in document order and skips fenced code blocks', () => {
    expect(extractMarkdownHeadings(BODY)).toEqual([
      { id: 'overview', text: 'Overview', level: 2 },
      { id: 'release-cadence', text: 'Release cadence', level: 3 },
      { id: 'risks', text: 'Risks', level: 2 },
    ]);
  });

  it('gives repeated heading text distinct ids', () => {
    expect(extractMarkdownHeadings('## Sources\n\n## Sources').map((h) => h.id)).toEqual([
      'sources',
      'sources-1',
    ]);
  });
});

describe('ResearchReportView · table of contents', () => {
  it('renders a nested contents list anchored to the rendered headings', () => {
    render(<ResearchReportView report={makeReport()} />);

    const toc = screen.getByTestId('research-report-toc');
    expect(
      within(toc)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Overview', 'Release cadence', 'Risks']);

    const body = screen.getByTestId('research-report-content');
    expect(body.querySelector('#overview')?.tagName).toBe('H2');
    expect(body.querySelector('#release-cadence')?.tagName).toBe('H3');
    expect(body.querySelector('#risks')?.tagName).toBe('H2');
  });

  it('scrolls the matching heading into view when an entry is clicked', async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    render(<ResearchReportView report={makeReport()} />);
    await user.click(within(screen.getByTestId('research-report-toc')).getByText('Risks'));

    expect(scrollIntoView).toHaveBeenCalled();
    const target = scrollIntoView.mock.instances[0] as HTMLElement;
    expect(target.id).toBe('risks');
  });

  it('omits the contents list for a report with fewer than three headings', () => {
    render(<ResearchReportView report={makeReport({ content: '## Only one\n\nBody.' })} />);
    expect(screen.queryByTestId('research-report-toc')).toBeNull();
  });
});

describe('ResearchReportView · artifact hand-off', () => {
  it('offers no artifact action when the host cannot receive one', () => {
    render(<ResearchReportView report={makeReport()} />);
    expect(screen.queryByTestId('research-report-create-artifact')).toBeNull();
  });

  it('hands the host a markdown artifact built from the whole report', async () => {
    const user = userEvent.setup();
    const onCreateArtifact = vi.fn();
    const report = makeReport({ keyFindings: ['v24 is LTS'] });

    render(<ResearchReportView report={report} onCreateArtifact={onCreateArtifact} />);
    await user.click(screen.getByTestId('research-report-create-artifact'));

    expect(onCreateArtifact).toHaveBeenCalledWith(researchReportToArtifact(report));
    const handed = onCreateArtifact.mock.calls[0]![0] as ReturnType<
      typeof researchReportToArtifact
    >;
    expect(handed.language).toBe('md');
    expect(handed.title).toBe('Node.js release status');
    expect(handed.content).toContain('## Key findings');
    expect(handed.content).toContain('## Overview');
  });
});
