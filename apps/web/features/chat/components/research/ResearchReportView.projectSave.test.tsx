import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ResearchReport } from '@agiworkforce/types';
import { useChatProjectStore } from '@agiworkforce/unified-chat';

import { ResearchReportView } from './ResearchReportView';

function makeReport(): ResearchReport {
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
    keyFindings: [],
    status: 'completed',
    sourcesConsulted: 1,
    totalDurationMs: 45_000,
    createdAt: '2026-08-05T10:00:00.000Z',
    completedAt: '2026-08-05T10:00:45.000Z',
  };
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function setProjects(projects: Array<{ id: string; name: string }>) {
  useChatProjectStore.setState({ projects: projects as never });
}

beforeEach(() => {
  setProjects([]);
});

describe('saving a research report into a project', () => {
  it('offers nothing when the account has no projects', () => {
    render(<ResearchReportView report={makeReport()} saveToProject={vi.fn()} />);

    expect(screen.queryByTestId('research-report-save-to-project')).toBeNull();
  });

  it('sends the report markdown as one of the project’s sources', async () => {
    setProjects([{ id: 'proj-1', name: 'Runway model' }]);
    const saveToProject = vi.fn(async () => {});
    render(<ResearchReportView report={makeReport()} saveToProject={saveToProject} />);

    fireEvent.keyDown(screen.getByTestId('research-report-save-to-project'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Runway model' }));

    await waitFor(() => expect(saveToProject).toHaveBeenCalledTimes(1));
    const [projectId, file] = saveToProject.mock.calls[0] as unknown as [string, File];
    expect(projectId).toBe('proj-1');
    expect(file.name.endsWith('.md')).toBe(true);
    const body = await readFile(file);
    expect(body).toContain('# Node.js release status');
    expect(body).toContain('## Sources');

    expect(await screen.findByTestId('research-report-saved-to-project')).toHaveTextContent(
      /Saved to Runway model/,
    );
  });

  it('says so when the save fails instead of reporting a save that did not happen', async () => {
    setProjects([{ id: 'proj-1', name: 'Runway model' }]);
    const saveToProject = vi.fn(async () => {
      throw new Error('Project sources are full');
    });
    render(<ResearchReportView report={makeReport()} saveToProject={saveToProject} />);

    fireEvent.keyDown(screen.getByTestId('research-report-save-to-project'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Runway model' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Project sources are full/);
    expect(screen.queryByTestId('research-report-saved-to-project')).toBeNull();
  });
});

describe('ResearchReportView save to library', () => {
  it('is its own action, separate from the artifact hand-off and from a project', async () => {
    setProjects([{ id: 'proj-1', name: 'Runway model' }]);
    const onSaveToLibrary = vi.fn(async (_file: File) => {});
    const onCreateArtifact = vi.fn();

    render(
      <ResearchReportView
        report={makeReport()}
        onSaveToLibrary={onSaveToLibrary}
        onCreateArtifact={onCreateArtifact}
      />,
    );

    fireEvent.click(screen.getByTestId('research-report-save-to-library'));

    await waitFor(() => expect(onSaveToLibrary).toHaveBeenCalledTimes(1));
    const file = onSaveToLibrary.mock.calls[0]?.[0] as File;
    expect(file.name.endsWith('.md')).toBe(true);
    expect(await readFile(file)).toContain('# Node.js release status');
    expect(onCreateArtifact).not.toHaveBeenCalled();
    expect(await screen.findByTestId('research-report-saved-to-library')).toHaveTextContent(
      /Saved to your library/,
    );
  });

  it('is not offered by a host that cannot write to the library', () => {
    setProjects([]);
    render(<ResearchReportView report={makeReport()} />);
    expect(screen.queryByTestId('research-report-save-to-library')).toBeNull();
  });

  it('reports a failed library save instead of claiming it worked', async () => {
    setProjects([]);
    const onSaveToLibrary = vi.fn(async (_file: File) => {
      throw new Error('Your library is full');
    });
    render(<ResearchReportView report={makeReport()} onSaveToLibrary={onSaveToLibrary} />);

    fireEvent.click(screen.getByTestId('research-report-save-to-library'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Your library is full/);
    expect(screen.queryByTestId('research-report-saved-to-library')).toBeNull();
  });
});
