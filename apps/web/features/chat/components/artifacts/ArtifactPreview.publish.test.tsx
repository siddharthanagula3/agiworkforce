import { useLayoutEffect } from 'react';
import { usePublicationView } from './usePublicationView';
import { beginPublicationCleanup } from '@features/sites/stores/published-sites-store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PublishResult } from '@agiworkforce/artifacts';
import { ArtifactPreview } from './ArtifactPreview';
import { setPublishedArtifactAudience } from './publishArtifactClient';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/client/csrf')>()),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => headers),
}));
import { useArtifactsStore } from '../../stores/artifacts-store';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
import { toast } from 'sonner';

afterEach(() => {
  cleanup();
  beginPublicationCleanup()();
});

const ARTIFACT_ID = 'artifact-publish-version-1';

function seedVersions() {
  const store = useArtifactsStore.getState();
  store.addArtifact({
    id: ARTIFACT_ID,
    type: 'html',
    title: 'Landing page',
    language: 'html',
    content: '<p>v1</p>',
    messageId: 'msg-1',
    conversationId: 'conv-1',
  });
  store.upsertArtifact({
    id: ARTIFACT_ID,
    type: 'html',
    title: 'Landing page',
    language: 'html',
    content: '<p>v2</p>',
    messageId: 'msg-1',
    conversationId: 'conv-1',
  });
}

describe('publishing from an older artifact version', () => {
  beforeEach(() => {
    useArtifactsStore.getState().reset();
    seedVersions();
  });

  it('hands the viewed version to the publisher instead of the latest content', async () => {
    const publishArtifact = vi.fn(async (): Promise<PublishResult> => ({
      kind: 'cloud',
      shareUrl: 'https://agiworkforce.com/shared-artifact/cccccccccccccccccccccccc',
      publishedAt: '2026-09-07T00:00:00.000Z',
    }));
    const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
    render(
      <ArtifactPreview
        artifact={artifact}
        variant="panel"
        versionHistory={useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)}
        publishArtifact={publishArtifact}
      />,
    );

    fireEvent.click(screen.getByLabelText('Previous version'));
    fireEvent.click(screen.getByLabelText('Publish artifact to a public link'));

    await waitFor(() => expect(publishArtifact).toHaveBeenCalledTimes(1));
    expect(publishArtifact).toHaveBeenCalledWith({ content: '<p>v1</p>', versionIndex: 0 });
  });

  it('publishes the latest content when no older version is selected', async () => {
    const publishArtifact = vi.fn(async (): Promise<PublishResult> => ({
      kind: 'cloud',
      shareUrl: 'https://agiworkforce.com/shared-artifact/dddddddddddddddddddddddd',
      publishedAt: '2026-09-07T00:00:00.000Z',
    }));
    const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
    render(
      <ArtifactPreview
        artifact={artifact}
        variant="panel"
        versionHistory={useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)}
        publishArtifact={publishArtifact}
      />,
    );

    fireEvent.click(screen.getByLabelText('Publish artifact to a public link'));

    await waitFor(() => expect(publishArtifact).toHaveBeenCalledTimes(1));
    expect(publishArtifact).toHaveBeenCalledWith({ content: '<p>v2</p>', versionIndex: 1 });
  });
});

function deferredPublish() {
  let resolve!: (result: PublishResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<PublishResult>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const PUBLIC_URL = 'https://agiworkforce.com/shared-artifact/aaaaaaaaaaaaaaaaaaaaaaaa';

describe('ArtifactPreview publication lifecycle', () => {
  const writeText = vi.fn(async () => {});
  beforeEach(() => {
    vi.clearAllMocks();
    useArtifactsStore.getState().reset();
    seedVersions();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['switch', 'round trip', 'version', 'unmount'])(
    'suppresses late publication UI and clipboard after %s',
    async (transition) => {
      const pending = deferredPublish();
      const publish = vi.fn(() => pending.promise);
      const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
      const versions = useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID);
      const view = (id = artifact.id) => (
        <ArtifactPreview
          artifact={{ ...artifact, id }}
          variant="panel"
          versionHistory={versions}
          publishArtifact={publish}
        />
      );
      const rendered = render(view());
      fireEvent.click(screen.getByLabelText('Publish artifact to a public link'));
      if (transition === 'unmount') rendered.unmount();
      else if (transition === 'version') fireEvent.click(screen.getByLabelText('Previous version'));
      else {
        rendered.rerender(view('artifact-b'));
        if (transition === 'round trip') rendered.rerender(view());
      }
      await act(async () => {
        pending.resolve({ kind: 'cloud', shareUrl: PUBLIC_URL, publishedAt: '2026-11-07' });
      });
      expect(writeText).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.queryByTestId('artifact-published-url')).not.toBeInTheDocument();
      if (transition !== 'unmount')
        expect(screen.getByLabelText('Publish artifact to a public link')).not.toBeDisabled();
    },
  );

  it('does not apply a confirmation after an artifact round trip', async () => {
    const onChange = vi.fn(async () => {});
    const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
    const view = (id: string) => (
      <ArtifactPreview
        artifact={{ ...artifact, id }}
        variant="panel"
        publishedLink={PUBLIC_URL}
        artifactAudience={{ current: 'public', memberCount: null, onChange }}
      />
    );
    const rendered = render(view(artifact.id));
    fireEvent.change(screen.getByLabelText('Who can open this'), { target: { value: 'invited' } });
    rendered.rerender(view('artifact-b'));
    rendered.rerender(view(artifact.id));
    fireEvent.click(screen.getByRole('button', { name: 'Limit to invited people' }));
    await act(async () => {});
    expect(onChange).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('does not apply a confirmation for a replaced same-token publication snapshot', async () => {
    const oldChange = vi.fn(async () => {});
    const newChange = vi.fn(async () => {});
    const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
    const view = (onChange: typeof oldChange) => (
      <ArtifactPreview
        artifact={artifact}
        variant="panel"
        publishedLink={PUBLIC_URL}
        artifactAudience={{ current: 'public', memberCount: null, onChange }}
      />
    );
    const rendered = render(view(oldChange));
    fireEvent.change(screen.getByLabelText('Who can open this'), { target: { value: 'invited' } });
    rendered.rerender(view(newChange));
    fireEvent.click(screen.getByRole('button', { name: 'Limit to invited people' }));
    await act(async () => {});
    expect(oldChange).not.toHaveBeenCalled();
    expect(newChange).not.toHaveBeenCalled();
  });
  it('does not let A completion clear the pending flag of B', async () => {
    const first = deferredPublish();
    const second = deferredPublish();
    const publish = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
    const view = (id: string) => (
      <ArtifactPreview artifact={{ ...artifact, id }} variant="panel" publishArtifact={publish} />
    );
    const rendered = render(view(artifact.id));
    fireEvent.click(screen.getByLabelText('Publish artifact to a public link'));
    rendered.rerender(view('artifact-b'));
    fireEvent.click(screen.getByLabelText('Publish artifact to a public link'));
    await act(async () => {
      first.resolve({ kind: 'cloud', shareUrl: PUBLIC_URL, publishedAt: '2026-11-07' });
    });
    expect(screen.getByLabelText('Publish artifact to a public link')).toBeDisabled();
    expect(writeText).not.toHaveBeenCalled();
    await act(async () => {
      second.resolve({ kind: 'cloud', shareUrl: PUBLIC_URL, publishedAt: '2026-11-07' });
    });
    expect(screen.getByLabelText('Publish artifact to a public link')).not.toBeDisabled();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('suppresses feedback if navigation occurs while clipboard writing is pending', async () => {
    let finishCopy!: () => void;
    writeText.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCopy = resolve;
        }),
    );
    const publish = vi.fn(async (): Promise<PublishResult> => ({
      kind: 'cloud',
      shareUrl: PUBLIC_URL,
      publishedAt: '2026-11-07',
    }));
    const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
    const rendered = render(
      <ArtifactPreview artifact={artifact} variant="panel" publishArtifact={publish} />,
    );
    fireEvent.click(screen.getByLabelText('Publish artifact to a public link'));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    rendered.rerender(
      <ArtifactPreview
        artifact={{ ...artifact, id: 'artifact-b' }}
        variant="panel"
        publishArtifact={publish}
      />,
    );
    await act(async () => finishCopy());
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByTestId('artifact-published-url')).not.toBeInTheDocument();
  });

  it('keeps B pending and suppresses A errors when an abandoned publish rejects', async () => {
    const first = deferredPublish();
    const second = deferredPublish();
    const publish = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
    const view = (id: string) => (
      <ArtifactPreview artifact={{ ...artifact, id }} variant="panel" publishArtifact={publish} />
    );
    const rendered = render(view(artifact.id));
    fireEvent.click(screen.getByLabelText('Publish artifact to a public link'));
    rendered.rerender(view('artifact-b'));
    fireEvent.click(screen.getByLabelText('Publish artifact to a public link'));
    await act(async () => first.reject(new Error('A failed')));
    expect(screen.getByLabelText('Publish artifact to a public link')).toBeDisabled();
    expect(toast.error).not.toHaveBeenCalled();
    await act(async () => second.reject(new Error('B failed')));
    expect(screen.getByLabelText('Publish artifact to a public link')).not.toBeDisabled();
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('starts one publish for repeated clicks and keeps current-owner success feedback', async () => {
    const pending = deferredPublish();
    const publish = vi.fn(() => pending.promise);
    const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
    render(<ArtifactPreview artifact={artifact} variant="panel" publishArtifact={publish} />);
    const button = screen.getByLabelText('Publish artifact to a public link');
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(publish).toHaveBeenCalledTimes(1);
    await act(async () =>
      pending.resolve({ kind: 'cloud', shareUrl: PUBLIC_URL, publishedAt: '2026-11-07' }),
    );
    expect(writeText).toHaveBeenCalledWith(PUBLIC_URL);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('artifact-published-url')).toHaveTextContent(PUBLIC_URL);
  });

  // UNRUN: WEB-PUBLICATION-QUOTA-ADMISSION-01 real audience client feedback integration.
  it.each(['legacy', 'audience', 'identity', 'json'])(
    'does not announce success for an unconfirmed %s audience receipt',
    async (invalid) => {
      const receipt = {
        token: PUBLIC_URL.split('/').at(-1)!,
        shareUrl: PUBLIC_URL,
        visibility: 'invited',
        title: 'Page',
        organizationId: null,
        updatedAt: '2026-11-07T00:00:00Z',
      };
      const body =
        invalid === 'legacy'
          ? { shareUrl: PUBLIC_URL }
          : invalid === 'audience'
            ? { ...receipt, visibility: 'public' }
            : {
                ...receipt,
                token: 'z'.repeat(24),
                shareUrl: `https://example.test/shared-artifact/${'z'.repeat(24)}`,
              };
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(invalid === 'json' ? new Response('{') : Response.json(body));
      const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
      const onChange = vi.fn(async (next: 'public' | 'organization' | 'invited') => {
        await setPublishedArtifactAudience(PUBLIC_URL, next, fetchImpl);
      });
      render(
        <ArtifactPreview
          artifact={artifact}
          variant="panel"
          publishedLink={PUBLIC_URL}
          artifactAudience={{ current: 'public', memberCount: null, onChange }}
        />,
      );
      fireEvent.change(screen.getByLabelText('Who can open this'), {
        target: { value: 'invited' },
      });
      expect(fetchImpl).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Limit to invited people' }));
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'Audience change could not be confirmed. Access may have changed, but its receipt was invalid.',
        ),
      );
      expect(toast.success).not.toHaveBeenCalled();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText('Who can open this')).toHaveValue('public');
      expect(screen.getByLabelText('Who can open this')).not.toBeDisabled();
    },
  );

  it.each(['resolve', 'reject'])(
    'suppresses an abandoned audience %s after switching artifacts',
    async (outcome) => {
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      const onChange = vi.fn(
        () =>
          new Promise<void>((done, fail) => {
            resolve = done;
            reject = fail;
          }),
      );
      const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
      const audience = { current: 'public' as const, memberCount: null, onChange };
      const view = (id: string) => (
        <ArtifactPreview
          artifact={{ ...artifact, id }}
          variant="panel"
          publishedLink={PUBLIC_URL}
          artifactAudience={audience}
        />
      );
      const rendered = render(view(artifact.id));
      fireEvent.change(screen.getByLabelText('Who can open this'), {
        target: { value: 'invited' },
      });
      const confirm = screen.getByRole('button', { name: 'Limit to invited people' });
      act(() => {
        fireEvent.click(confirm);
        fireEvent.click(confirm);
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      rendered.rerender(view('artifact-b'));
      await act(async () => (outcome === 'resolve' ? resolve() : reject(new Error('A failed'))));
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Who can open this')).not.toBeDisabled();
    },
  );

  it('suppresses real Preview publication feedback when cleanup closes its lease before a React commit', async () => {
    const pending = deferredPublish();
    const publish = vi.fn(() => pending.promise);
    const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
    let commits = 0;
    let owner: ReturnType<typeof usePublicationView> | undefined;
    function BoundaryModel() {
      owner = usePublicationView(ARTIFACT_ID);
      useLayoutEffect(() => {
        commits += 1;
      });
      return <ArtifactPreview artifact={artifact} variant="panel" publishArtifact={publish} />;
    }
    render(<BoundaryModel />);
    fireEvent.click(screen.getByLabelText('Publish artifact to a public link'));
    const capturedOwner = owner!;
    const beforeCleanup = commits;
    let finish = () => {};
    try {
      await act(async () => {
        finish = beginPublicationCleanup();
        expect(commits).toBe(beforeCleanup);
        expect(capturedOwner.active).toBe(false);
        pending.resolve({ kind: 'cloud', shareUrl: PUBLIC_URL, publishedAt: '2026-11-07' });
        await pending.promise;
        expect(commits).toBe(beforeCleanup);
        expect(writeText).not.toHaveBeenCalled();
        expect(toast.success).not.toHaveBeenCalled();
      });
      expect(writeText).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.queryByTestId('artifact-published-url')).not.toBeInTheDocument();
    } finally {
      cleanup();
      finish();
      pending.resolve({ kind: 'cloud', shareUrl: PUBLIC_URL, publishedAt: '2026-11-07' });
      await pending.promise;
    }
  });
});
