import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ArtifactPreview, type ArtifactAudienceControl } from './ArtifactPreview';
import { useArtifactsStore } from '../../stores/artifacts-store';

vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(async () => 'test-token'),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => ({
    ...(headers as Record<string, string>),
    'x-csrf-token': 'test-token',
  })),
}));

const ARTIFACT_ID = 'artifact-edit-steps-1';
const SHARE_URL = 'https://agiworkforce.com/shared-artifact/dddddddddddddddddddddddd';

function seed(contents: string[]) {
  const store = useArtifactsStore.getState();
  const [first, ...rest] = contents;
  store.addArtifact({
    id: ARTIFACT_ID,
    type: 'html',
    title: 'Landing page',
    language: 'html',
    content: first!,
    messageId: 'msg-1',
    conversationId: 'conv-1',
  });
  for (const content of rest) {
    store.upsertArtifact({
      id: ARTIFACT_ID,
      type: 'html',
      title: 'Landing page',
      language: 'html',
      content,
      messageId: 'msg-1',
      conversationId: 'conv-1',
    });
  }
}

function LivePanel({ artifactAudience }: { artifactAudience?: ArtifactAudienceControl }) {
  const artifact = useArtifactsStore((s) => s.artifacts.find((a) => a.id === ARTIFACT_ID))!;
  const versions = useArtifactsStore((s) => s.getArtifactVersions(ARTIFACT_ID));
  return (
    <ArtifactPreview
      artifact={artifact}
      variant="panel"
      versionHistory={versions}
      {...(artifactAudience ? { artifactAudience, publishedLink: SHARE_URL } : {})}
    />
  );
}

function latestContent() {
  return useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)?.content;
}

describe('artifact undo and redo', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
  });

  it('offers no undo for an artifact with a single version', () => {
    seed(['<p>v1</p>']);
    render(<LivePanel />);
    expect(screen.queryByTestId('artifact-undo')).not.toBeInTheDocument();
    expect(screen.queryByTestId('artifact-redo')).not.toBeInTheDocument();
  });

  it('steps back through saved versions and forward again, keeping every version', () => {
    seed(['<p>v1</p>', '<p>v2</p>', '<p>v3</p>']);
    render(<LivePanel />);

    expect(screen.getByTestId('artifact-redo')).toBeDisabled();

    fireEvent.click(screen.getByTestId('artifact-undo'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(latestContent()).toBe('<p>v2</p>');

    fireEvent.click(screen.getByTestId('artifact-undo'));
    expect(latestContent()).toBe('<p>v1</p>');
    expect(screen.getByTestId('artifact-undo')).toBeDisabled();

    fireEvent.click(screen.getByTestId('artifact-redo'));
    expect(latestContent()).toBe('<p>v2</p>');

    fireEvent.click(screen.getByTestId('artifact-redo'));
    expect(latestContent()).toBe('<p>v3</p>');
    expect(screen.getByTestId('artifact-redo')).toBeDisabled();

    expect(
      useArtifactsStore
        .getState()
        .getArtifactVersions(ARTIFACT_ID)
        .map((v) => v.content),
    ).toEqual([
      '<p>v1</p>',
      '<p>v2</p>',
      '<p>v3</p>',
      '<p>v2</p>',
      '<p>v1</p>',
      '<p>v2</p>',
      '<p>v3</p>',
    ]);
  });

  it('drops the redo step once a new version arrives from elsewhere', () => {
    seed(['<p>v1</p>', '<p>v2</p>']);
    render(<LivePanel />);

    fireEvent.click(screen.getByTestId('artifact-undo'));
    expect(screen.getByTestId('artifact-redo')).not.toBeDisabled();

    const stored = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
    useArtifactsStore.getState().upsertArtifact({ ...stored, content: '<p>v3</p>' });

    return waitFor(() => expect(screen.getByTestId('artifact-redo')).toBeDisabled());
  });
});

describe('artifact last modified line', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
  });

  it('shows when the shown version was last changed', () => {
    seed(['<p>v1</p>', '<p>v2</p>']);
    render(<LivePanel />);
    const line = screen.getByTestId('artifact-last-modified');
    expect(line.tagName).toBe('TIME');
    expect(line).toHaveTextContent(/^Last modified /);
    const latest = useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID).at(-1)!;
    expect(line).toHaveAttribute('datetime', latest.updatedAt ?? latest.createdAt);
  });
});

describe('invited-people audience', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
    seed(['<p>v1</p>']);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers invited people without a workspace and switches only after confirmation', async () => {
    const onChange = vi.fn(async () => {});
    render(<LivePanel artifactAudience={{ current: 'public', memberCount: null, onChange }} />);

    const select = screen.getByLabelText('Who can open this');
    expect(Array.from((select as HTMLSelectElement).options).map((option) => option.value)).toEqual(
      ['public', 'invited'],
    );

    fireEvent.change(select, { target: { value: 'invited' } });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Limit this to people you invite?')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Limit to invited people' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('invited'));
  });

  it('lists and adds invited people on the published page', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      Response.json({
        viewers:
          init?.method === 'POST'
            ? [{ email: 'ana@example.com', invitedAt: '2026-10-20T00:00:00.000Z' }]
            : [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <LivePanel
        artifactAudience={{ current: 'invited', memberCount: 4, onChange: vi.fn(async () => {}) }}
      />,
    );

    expect(screen.getByTestId('artifact-invited-viewers')).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText('Email address to share with'), {
      target: { value: 'ana@example.com' },
    });
    fireEvent.click(screen.getByTestId('site-viewer-add'));

    expect(await screen.findByText('ana@example.com')).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(post[0]).toBe('/api/artifacts/publish/dddddddddddddddddddddddd/viewers');
  });

  it('hides the people list for the other audiences', () => {
    render(
      <LivePanel
        artifactAudience={{ current: 'organization', memberCount: 4, onChange: vi.fn() }}
      />,
    );
    expect(screen.queryByTestId('artifact-invited-viewers')).not.toBeInTheDocument();
    expect(
      Array.from((screen.getByLabelText('Who can open this') as HTMLSelectElement).options).map(
        (option) => option.value,
      ),
    ).toEqual(['public', 'organization', 'invited']);
  });
});
