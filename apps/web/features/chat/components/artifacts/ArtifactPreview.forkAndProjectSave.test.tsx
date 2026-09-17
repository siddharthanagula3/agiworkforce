import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ArtifactPreview } from './ArtifactPreview';
import { useArtifactsStore } from '../../stores/artifacts-store';

const ARTIFACT_ID = 'artifact-fork-panel';

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function seed(content = '<p>v1</p>') {
  useArtifactsStore.getState().addArtifact({
    id: ARTIFACT_ID,
    type: 'html',
    title: 'Landing page',
    language: 'html',
    content,
    messageId: 'msg-1',
    conversationId: 'conv-1',
  });
}

function renderPanel(extra: Record<string, unknown> = {}) {
  const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
  return render(
    <ArtifactPreview
      artifact={artifact}
      variant="panel"
      versionHistory={useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)}
      {...extra}
    />,
  );
}

beforeEach(() => {
  useArtifactsStore.getState().reset();
});

describe('duplicating an artifact from the panel', () => {
  it('adds a second artifact that starts from what is on screen', () => {
    seed();
    renderPanel();

    fireEvent.click(screen.getByTestId('artifact-fork'));

    const state = useArtifactsStore.getState();
    expect(state.artifacts).toHaveLength(2);
    const copy = state.artifacts.find((a) => a.id !== ARTIFACT_ID)!;
    expect(copy.title).toBe('Landing page (copy)');
    expect(copy.content).toBe('<p>v1</p>');
    expect(state.selectedArtifactId).toBe(copy.id);
  });

  it('is not offered on the inline card, which has no store artifact behind it', () => {
    seed();
    const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
    render(<ArtifactPreview artifact={artifact} variant="card" />);

    expect(screen.queryByTestId('artifact-fork')).toBeNull();
  });
});

describe('saving an artifact into a project', () => {
  it('sends the artifact body under a name the source allowlist accepts', async () => {
    seed('<p>keep me</p>');
    const onSave = vi.fn(async () => {});
    renderPanel({
      projectSave: { projects: [{ id: 'proj-1', name: 'Runway model' }], onSave },
    });

    fireEvent.keyDown(screen.getByTestId('artifact-save-to-project'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Runway model' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [projectId, file] = onSave.mock.calls[0] as unknown as [string, File];
    expect(projectId).toBe('proj-1');
    expect(file.name).toBe('Landing page.html');
    expect(await readFile(file)).toBe('<p>keep me</p>');
  });

  it('falls back to Markdown when the artifact language is not an accepted source type', async () => {
    useArtifactsStore.getState().addArtifact({
      id: 'artifact-mermaid',
      type: 'mermaid',
      title: 'Flow',
      language: 'mermaid',
      content: 'graph TD;A-->B;',
      messageId: 'msg-2',
      conversationId: 'conv-1',
    });
    const artifact = useArtifactsStore
      .getState()
      .artifacts.find((a) => a.id === 'artifact-mermaid')!;
    const onSave = vi.fn(async () => {});
    render(
      <ArtifactPreview
        artifact={artifact}
        variant="panel"
        projectSave={{ projects: [{ id: 'proj-1', name: 'Runway model' }], onSave }}
      />,
    );

    fireEvent.keyDown(screen.getByTestId('artifact-save-to-project'), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Runway model' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [, file] = onSave.mock.calls[0] as unknown as [string, File];
    expect(file.name).toBe('Flow.md');
    expect(await readFile(file)).toContain('graph TD;A-->B;');
  });

  it('offers nothing when the account has no projects', () => {
    seed();
    renderPanel({ projectSave: { projects: [], onSave: vi.fn() } });

    expect(screen.queryByTestId('artifact-save-to-project')).toBeNull();
  });
});
