import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProjectFileCitations } from './ProjectFileCitationChip';

beforeEach(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

const PAGE_CITATION = {
  fileName: 'pricing.pdf',
  fileId: 'file-1',
  projectId: 'project-1',
  snippet: 'Refunds are issued to the original payment method within 14 days.',
  anchor: { page: 4 },
};

const HEADING_CITATION = {
  fileName: 'handbook.md',
  fileId: 'file-2',
  projectId: 'project-1',
  snippet: 'Support hours are 09:00 to 17:00 UTC.',
  anchor: { headingPath: ['Pricing', 'Refunds'] },
};

describe('ProjectFileCitations', () => {
  it('names the page a paginated passage came from and links to it', () => {
    render(<ProjectFileCitations citations={[PAGE_CITATION]} />);

    const chip = screen.getByRole('link', { name: 'Project file pricing.pdf, p. 4' });
    expect(chip.getAttribute('href')).toBe('/chat/projects/project-1?knowledgeFile=file-1&page=4');
    expect(screen.getAllByText('pricing.pdf').length).toBeGreaterThan(0);
    expect(screen.getAllByText('p. 4').length).toBeGreaterThan(0);
  });

  it('names the heading trail a document passage came from', () => {
    render(<ProjectFileCitations citations={[HEADING_CITATION]} />);

    const chip = screen.getByRole('link', {
      name: 'Project file handbook.md, Pricing › Refunds',
    });
    expect(chip.getAttribute('href')).toBe('/chat/projects/project-1?knowledgeFile=file-2');
    expect(screen.getAllByText('Pricing › Refunds').length).toBeGreaterThan(0);
  });

  it('opens a hover card carrying the passage and its anchor', async () => {
    render(<ProjectFileCitations citations={[PAGE_CITATION]} />);

    await userEvent.hover(screen.getByRole('link', { name: /^Project file pricing\.pdf/ }));

    expect((await screen.findAllByText(/original payment method/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('p. 4').length).toBeGreaterThan(1);
  });

  it('renders a file with no anchor as a plain chip', () => {
    render(<ProjectFileCitations citations={[{ fileName: 'notes.txt' }]} />);

    expect(screen.getByRole('note', { name: 'Project file notes.txt' }).tagName).toBe('SPAN');
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('ProjectFileCitations ordering', () => {
  const pages = [4, 9, 14].map((page) => ({
    fileName: 'runbook.pdf',
    fileId: 'file-3',
    projectId: 'project-1',
    anchor: { page },
  }));

  it('leads with the place the answer named', () => {
    render(
      <ProjectFileCitations
        citations={pages}
        answerText="According to runbook.pdf (p. 14) the code is QX-4417."
      />,
    );

    const labels = screen.getAllByRole('link').map((chip) => chip.getAttribute('aria-label'));
    expect(labels[0]).toBe('Project file runbook.pdf, p. 14');
    expect(labels).toHaveLength(3);
  });

  it('keeps document order when the answer named no place', () => {
    render(<ProjectFileCitations citations={pages} answerText="The code is QX-4417." />);

    const labels = screen.getAllByRole('link').map((chip) => chip.getAttribute('aria-label'));
    expect(labels[0]).toBe('Project file runbook.pdf, p. 4');
  });
});
