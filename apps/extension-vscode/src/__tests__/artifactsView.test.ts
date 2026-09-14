import { describe, expect, it, vi } from 'vitest';
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
  artifactEditorLanguage,
  artifactFileName,
  describeArtifactFailure,
} from '../features/artifacts/artifactPresentation';
import { readArtifactContent } from '../features/artifacts/artifactActions';
import type { ArtifactsWorkspace } from '../features/artifacts/artifactsClient';

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

      expect(items).toHaveLength(1);
      expect(items[0]?.contextValue).toBe('artifact');
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
