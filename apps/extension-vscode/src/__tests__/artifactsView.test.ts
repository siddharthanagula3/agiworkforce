import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ManagedCloudArtifactIndexEntry,
  ManagedCloudPublishedArtifact,
} from '@agiworkforce/cloud-contracts';
import {
  ArtifactTreeItem,
  ArtifactsTreeProvider,
  OPEN_ARTIFACT_COMMAND,
  REFRESH_ARTIFACTS_COMMAND,
  readArtifactCommandArgument,
} from '../features/artifacts/artifactsTree';
import {
  artifactDescription,
  artifactEditorLanguage,
  artifactFileName,
  artifactTooltipLines,
  describeArtifactFailure,
} from '../features/artifacts/artifactPresentation';
import {
  ArtifactContentProvider,
  artifactUri,
  readArtifactContent,
} from '../features/artifacts/artifactActions';
import {
  createExtensionArtifactsWorkspace,
  type ArtifactsWorkspace,
} from '../features/artifacts/artifactsClient';

const CONVERSATION_ID = '11111111-1111-4111-8111-111111111111';
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222';
const ARTIFACT_MARKDOWN = 'Here you go:\n\n```html\n<h1>Invoice</h1>\n<div>total</div>\n```\n';

function makeArtifact(
  overrides: Partial<ManagedCloudArtifactIndexEntry> = {},
): ManagedCloudArtifactIndexEntry {
  return {
    id: 'artifact_1',
    conversationId: CONVERSATION_ID,
    messageId: MESSAGE_ID,
    title: 'Invoice page',
    type: 'html',
    language: 'html',
    projectId: null,
    createdAt: '2026-09-13T11:00:00.000Z',
    ...overrides,
  };
}

function makePublished(
  overrides: Partial<ManagedCloudPublishedArtifact> = {},
): ManagedCloudPublishedArtifact {
  return {
    token: 'tok_1',
    artifactId: 'artifact_1',
    title: 'Invoice page',
    kind: 'html',
    language: 'html',
    contentChars: 42,
    visibility: 'public',
    createdAt: '2026-09-13T11:00:00.000Z',
    updatedAt: '2026-09-13T11:00:00.000Z',
    shareUrl: 'https://agiworkforce.com/a/tok_1',
    sandboxed: true,
    ...overrides,
  };
}

describe('artifacts tree', () => {
  it('maps the hosted index into items and marks the published ones', async () => {
    const client = {
      listArtifacts: vi
        .fn()
        .mockResolvedValue([makeArtifact(), makeArtifact({ id: 'artifact_2', title: 'Chart' })]),
      listPublishedArtifacts: vi.fn().mockResolvedValue([makePublished()]),
    };
    const provider = new ArtifactsTreeProvider(() =>
      Promise.resolve({ status: 'ready' as const, client }),
    );
    try {
      const items = (await provider.getChildren()) as ArtifactTreeItem[];

      expect(client.listArtifacts).toHaveBeenCalledWith({ limit: 100 });
      expect(items).toHaveLength(2);
      expect(items[0]?.id).toBe('artifact_1');
      expect(items[0]?.contextValue).toBe('artifactPublished');
      expect(items[0]?.description).toContain('published');
      expect(items[1]?.contextValue).toBe('artifact');
      expect((items[0]?.command as { command: string }).command).toBe(OPEN_ARTIFACT_COMMAND);
    } finally {
      provider.dispose();
    }
  });

  it('still lists artifacts when the published read fails', async () => {
    const client = {
      listArtifacts: vi.fn().mockResolvedValue([makeArtifact()]),
      listPublishedArtifacts: vi.fn().mockRejectedValue({ status: 503 }),
    };
    const provider = new ArtifactsTreeProvider(() =>
      Promise.resolve({ status: 'ready' as const, client }),
    );
    try {
      const items = (await provider.getChildren()) as ArtifactTreeItem[];

      expect(items).toHaveLength(2);
      expect(items[0]?.label).toBe('Published status could not be loaded');
      expect((items[0]?.command as { command: string }).command).toBe(REFRESH_ARTIFACTS_COMMAND);
      expect(items[1]?.contextValue).toBe('artifact');
    } finally {
      provider.dispose();
    }
  });

  it('asks the user to sign in rather than showing an empty list', async () => {
    const provider = new ArtifactsTreeProvider(() => Promise.resolve({ status: 'signed-out' }));
    try {
      const [notice] = await provider.getChildren();

      expect(notice?.label).toBe('Sign in to see your artifacts');
      expect((notice?.command as { command: string }).command).toBe('agi-workforce.signIn');
    } finally {
      provider.dispose();
    }
  });

  it('names an expired session when the hosted index answers 401', async () => {
    const client = {
      listArtifacts: vi.fn().mockRejectedValue({ status: 401 }),
      listPublishedArtifacts: vi.fn(),
    };
    const provider = new ArtifactsTreeProvider(() =>
      Promise.resolve({ status: 'ready' as const, client }),
    );
    try {
      const [notice] = await provider.getChildren();

      expect(notice?.label).toBe('Artifacts could not be loaded');
      expect(String(notice?.tooltip)).toBe(describeArtifactFailure({ status: 401 }));
      expect((notice?.command as { command: string }).command).toBe(REFRESH_ARTIFACTS_COMMAND);
      expect(client.listPublishedArtifacts).not.toHaveBeenCalled();
    } finally {
      provider.dispose();
    }
  });

  it('only accepts a tree item that carries an artifact', () => {
    expect(readArtifactCommandArgument(new ArtifactTreeItem(makeArtifact(), undefined))?.id).toBe(
      'artifact_1',
    );
    expect(readArtifactCommandArgument({ artifact: { id: '' } })).toBeUndefined();
    expect(readArtifactCommandArgument('artifact_1')).toBeUndefined();
  });
});

describe('cloud task outputs rail', () => {
  it('lists only the artifacts of the conversation the run wrote into', async () => {
    const { cloudRunArtifacts } = await import('../features/cloud-tasks/cloudRunDetail');
    const run = { conversationId: CONVERSATION_ID } as Parameters<typeof cloudRunArtifacts>[0];
    const mine = makeArtifact();
    const other = makeArtifact({ id: 'artifact_2', conversationId: 'someone-elses' });

    expect(cloudRunArtifacts(run, [mine, other]).map((a) => a.id)).toEqual(['artifact_1']);
  });

  it('has no outputs when the run never opened a conversation', async () => {
    const { cloudRunArtifacts } = await import('../features/cloud-tasks/cloudRunDetail');
    const run = { conversationId: null } as Parameters<typeof cloudRunArtifacts>[0];

    expect(cloudRunArtifacts(run, [makeArtifact()])).toEqual([]);
  });

  it('offers each deliverable as an item that opens that artifact', async () => {
    const { buildCloudRunDetailItems } = await import('../features/cloud-tasks/cloudRunDetail');
    const run = {
      conversationId: CONVERSATION_ID,
      state: 'completed',
      pendingApproval: undefined,
    } as Parameters<typeof buildCloudRunDetailItems>[0];

    const items = buildCloudRunDetailItems(run, [], [makeArtifact()]);
    const output = items.find((item) => item.action === 'open-artifact');

    expect(output?.label).toContain('Invoice page');
    expect(output?.artifactId).toBe('artifact_1');
  });
});

describe('artifact content and language', () => {
  it('re-derives content from the source message under the indexed id', async () => {
    const workspace = {
      chat: {
        getConversation: vi.fn().mockResolvedValue({
          messages: [{ id: MESSAGE_ID, content: ARTIFACT_MARKDOWN }],
        }),
      },
    } as unknown as ArtifactsWorkspace;
    const { deriveArtifacts } = await import('@agiworkforce/artifacts');
    const derived = deriveArtifacts(ARTIFACT_MARKDOWN, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
    });
    const indexed = makeArtifact({ id: derived[0]!.id });

    const content = await readArtifactContent(workspace, indexed);

    expect(content).toContain('<h1>Invoice</h1>');
  });

  it('reports nothing to show when the message no longer produces that artifact', async () => {
    const workspace = {
      chat: {
        getConversation: vi
          .fn()
          .mockResolvedValue({ messages: [{ id: MESSAGE_ID, content: 'no fenced blocks here' }] }),
      },
    } as unknown as ArtifactsWorkspace;

    expect(await readArtifactContent(workspace, makeArtifact())).toBeUndefined();
  });

  it('follows message pages until the source message appears', async () => {
    const getConversation = vi
      .fn()
      .mockResolvedValueOnce({ messages: [{ id: 'm1', content: 'plain' }], hasMore: true })
      .mockResolvedValueOnce({ messages: [{ id: 'm2', content: 'plain' }], hasMore: true })
      .mockResolvedValueOnce({
        messages: [{ id: MESSAGE_ID, content: ARTIFACT_MARKDOWN }],
        hasMore: false,
      });
    const workspace = { chat: { getConversation } } as unknown as ArtifactsWorkspace;
    const { deriveArtifacts } = await import('@agiworkforce/artifacts');
    const derived = deriveArtifacts(ARTIFACT_MARKDOWN, {
      conversationId: CONVERSATION_ID,
      messageId: MESSAGE_ID,
    });

    const content = await readArtifactContent(workspace, makeArtifact({ id: derived[0]!.id }));

    expect(content).toContain('<h1>Invoice</h1>');
    expect(getConversation.mock.calls.map((call) => call[1])).toEqual([
      { limit: 500, offset: 0 },
      { limit: 500, offset: 1 },
      { limit: 500, offset: 2 },
    ]);
  });

  it('reports a missing source only after the last page has been read', async () => {
    const getConversation = vi
      .fn()
      .mockResolvedValueOnce({ messages: [{ id: 'm1', content: 'plain' }], hasMore: true })
      .mockResolvedValueOnce({ messages: [{ id: 'm2', content: 'plain' }], hasMore: false });
    const workspace = { chat: { getConversation } } as unknown as ArtifactsWorkspace;

    expect(await readArtifactContent(workspace, makeArtifact())).toBeUndefined();
    expect(getConversation).toHaveBeenCalledTimes(2);
  });

  it('fails instead of claiming exhaustion when pages stop progressing', async () => {
    const getConversation = vi.fn().mockResolvedValue({ messages: [], hasMore: true });
    const workspace = { chat: { getConversation } } as unknown as ArtifactsWorkspace;

    await expect(readArtifactContent(workspace, makeArtifact())).rejects.toThrow(
      'could not be searched',
    );
    expect(getConversation).toHaveBeenCalledTimes(1);
  });

  it('fails instead of claiming exhaustion when the page bound is reached', async () => {
    const getConversation = vi
      .fn()
      .mockResolvedValue({ messages: [{ id: 'm1', content: 'plain' }], hasMore: true });
    const workspace = { chat: { getConversation } } as unknown as ArtifactsWorkspace;

    await expect(readArtifactContent(workspace, makeArtifact())).rejects.toThrow(
      'could not be searched',
    );
    expect(getConversation).toHaveBeenCalledTimes(100);
  });

  it('resolves an editor language and file name for each artifact face', () => {
    expect(artifactEditorLanguage(makeArtifact())).toBe('html');
    expect(artifactEditorLanguage(makeArtifact({ type: 'react', language: 'tsx' }))).toBe(
      'typescriptreact',
    );
    expect(artifactEditorLanguage(makeArtifact({ type: 'mermaid', language: null }))).toBe(
      'markdown',
    );
    expect(artifactEditorLanguage(makeArtifact({ type: 'code', language: 'py' }))).toBe('python');
    expect(artifactFileName(makeArtifact())).toBe('invoice-page.html');
    expect(artifactFileName(makeArtifact({ title: null, type: 'code', language: 'ts' }))).toBe(
      'untitled-code.ts',
    );
  });
});

describe('published audience', () => {
  it('names an artifact shared with invited people', () => {
    const published = { visibility: 'invited' as const };
    expect(artifactDescription(makeArtifact(), published)).toContain('shared with invited people');
    expect(artifactTooltipLines(makeArtifact(), published)).toContain(
      'A published copy of this artifact opens only for the people it was shared with.',
    );
  });
});

describe('published artifact listing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubPages(pages: Array<{ artifacts: unknown[]; nextCursor: string | null }>) {
    const fetchMock = vi.fn();
    for (const page of pages) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          artifacts: page.artifacts,
          pageInfo: { nextCursor: page.nextCursor },
        }),
      });
    }
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('follows the cursor until every publication has been read', async () => {
    const fetchMock = stubPages([
      { artifacts: [makePublished({ token: 'tok_1', artifactId: 'a1' })], nextCursor: 'c 1' },
      { artifacts: [makePublished({ token: 'tok_2', artifactId: 'a2' })], nextCursor: null },
    ]);

    const published =
      await createExtensionArtifactsWorkspace('token').index.listPublishedArtifacts();

    expect(published.map((entry) => entry.artifactId)).toEqual(['a1', 'a2']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('cursor=');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('?cursor=c%201');
  });

  it('fails instead of returning a truncated list when the cursor repeats', async () => {
    stubPages([
      { artifacts: [makePublished()], nextCursor: 'same' },
      { artifacts: [makePublished({ token: 'tok_2' })], nextCursor: 'same' },
      { artifacts: [], nextCursor: 'same' },
    ]);

    await expect(
      createExtensionArtifactsWorkspace('token').index.listPublishedArtifacts(),
    ).rejects.toMatchObject({ status: 502, message: expect.stringContaining('incomplete') });
  });

  it('fails when the page bound is reached while more pages remain', async () => {
    const fetchMock = vi.fn();
    let call = 0;
    fetchMock.mockImplementation(async () => {
      call += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ artifacts: [], pageInfo: { nextCursor: `cursor-${call}` } }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createExtensionArtifactsWorkspace('token').index.listPublishedArtifacts(),
    ).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(100);
  });
});

describe('artifact content cache', () => {
  it('drops cached text and tells open documents to reload on clear', () => {
    const provider = new ArtifactContentProvider();
    const artifact = makeArtifact();
    const changed: unknown[] = [];
    provider.onDidChange((uri) => changed.push(uri));

    provider.set(artifact, '<h1>Invoice</h1>');
    expect(provider.provideTextDocumentContent(artifactUri(artifact))).toBe('<h1>Invoice</h1>');

    changed.length = 0;
    provider.clear();

    expect(provider.provideTextDocumentContent(artifactUri(artifact))).toBe('');
    expect(changed).toHaveLength(1);
    provider.dispose();
  });
});
