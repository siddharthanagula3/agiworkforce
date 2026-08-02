import { describe, it, expect } from 'vitest';
import type { ChatMessage } from '@agiworkforce/unified-chat';
import { computeDerivedArtifactId } from '@agiworkforce/artifacts';
import { deriveDesktopMessageArtifacts } from '../desktopArtifactProjection';

const CONVERSATION_ID = 'conv-des-c05';

function assistant(content: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content,
    createdAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('deriveDesktopMessageArtifacts (DES-C05)', () => {
  it('turns a fenced html block in a cloud answer into a real artifact', () => {
    const message = assistant(
      'Here is your landing page:\n\n```html\n<!DOCTYPE html><html><head><title>Pricing</title></head><body><h1>Pricing</h1></body></html>\n```\n\nLet me know what to change.',
    );

    const projection = deriveDesktopMessageArtifacts(message, { conversationId: CONVERSATION_ID });

    expect(projection).not.toBeNull();
    expect(projection!.artifacts).toHaveLength(1);
    expect(projection!.artifacts[0]!.type).toBe('html');
    expect(projection!.artifacts[0]!.title).toBe('Pricing');
    expect(projection!.artifacts[0]!.content).toContain('<h1>Pricing</h1>');
  });

  it('strips the artifact fence from the rendered body but leaves the prose', () => {
    const message = assistant('Intro line.\n\n```html\n<div>hello</div>\n```\n\nOutro line.');

    const projection = deriveDesktopMessageArtifacts(message, { conversationId: CONVERSATION_ID })!;

    expect(projection.displayContent).toContain('Intro line.');
    expect(projection.displayContent).toContain('Outro line.');
    expect(projection.displayContent).not.toContain('<div>hello</div>');
  });

  it('assigns the deterministic cross-surface id so a reload does not duplicate it', () => {
    const message = assistant('```html\n<div>a</div>\n```');

    const first = deriveDesktopMessageArtifacts(message, { conversationId: CONVERSATION_ID })!;
    const second = deriveDesktopMessageArtifacts(
      { ...message, createdAt: '2026-08-02T00:00:00.000Z' },
      { conversationId: CONVERSATION_ID },
    )!;

    expect(first.artifacts[0]!.id).toBe(computeDerivedArtifactId(CONVERSATION_ID, 'msg-1', 0));
    expect(second.artifacts[0]!.id).toBe(first.artifacts[0]!.id);
  });

  it('lets a persisted artifact with the same id overlay its derived counterpart', () => {
    const derivedId = computeDerivedArtifactId(CONVERSATION_ID, 'msg-1', 0);
    const message = assistant('```html\n<div>original</div>\n```', {
      artifacts: [
        {
          id: derivedId,
          type: 'html',
          title: 'Edited page',
          content: '<div>edited</div>',
        },
      ],
    });

    const projection = deriveDesktopMessageArtifacts(message, { conversationId: CONVERSATION_ID })!;

    expect(projection.artifacts).toHaveLength(1);
    expect(projection.artifacts[0]!.content).toBe('<div>edited</div>');
    expect(projection.artifacts[0]!.title).toBe('Edited page');
  });

  it('appends pre-attached artifacts that have no derived counterpart', () => {
    const message = assistant('```html\n<div>a</div>\n```', {
      artifacts: [
        { id: 'generated-file-1', type: 'image', title: 'Chart', content: 'https://example/x.png' },
      ],
    });

    const projection = deriveDesktopMessageArtifacts(message, { conversationId: CONVERSATION_ID })!;

    expect(projection.artifacts.map((a) => a.id)).toEqual([
      computeDerivedArtifactId(CONVERSATION_ID, 'msg-1', 0),
      'generated-file-1',
    ]);
  });

  it('returns null for a plain code answer so an ordinary snippet stays a code block', () => {
    const message = assistant('```python\nprint("hi")\nprint("there")\n```');

    expect(deriveDesktopMessageArtifacts(message, { conversationId: CONVERSATION_ID })).toBeNull();
  });

  it('returns null for user messages and for empty assistant content', () => {
    expect(
      deriveDesktopMessageArtifacts(
        { id: 'u1', role: 'user', content: '```html\n<div>x</div>\n```' },
        { conversationId: CONVERSATION_ID },
      ),
    ).toBeNull();
    expect(
      deriveDesktopMessageArtifacts(assistant(''), { conversationId: CONVERSATION_ID }),
    ).toBeNull();
  });

  it('is timestamp-stable across renders so the memoized projection does not thrash', () => {
    const message = assistant('```html\n<div>a</div>\n```');

    const a = deriveDesktopMessageArtifacts(message, { conversationId: CONVERSATION_ID })!;
    const b = deriveDesktopMessageArtifacts(message, { conversationId: CONVERSATION_ID })!;

    expect(b.artifacts[0]!.createdAt).toBe(a.artifacts[0]!.createdAt);
    expect(a.artifacts[0]!.createdAt).toBe('2026-08-01T10:00:00.000Z');
  });

  it('derives every renderable block in a multi-artifact answer with distinct ordinals', () => {
    const message = assistant(
      'One:\n```html\n<div>one</div>\n```\nTwo:\n```svg\n<svg width="10"></svg>\n```',
    );

    const projection = deriveDesktopMessageArtifacts(message, { conversationId: CONVERSATION_ID })!;

    expect(projection.artifacts.map((a) => a.type)).toEqual(['html', 'svg']);
    expect(projection.artifacts.map((a) => a.id)).toEqual([
      computeDerivedArtifactId(CONVERSATION_ID, 'msg-1', 0),
      computeDerivedArtifactId(CONVERSATION_ID, 'msg-1', 1),
    ]);
  });
});
