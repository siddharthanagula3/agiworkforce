import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ComposerSendMeta } from '@/features/chat/components/Composer/ChatComposerNew';
import { getProviderOfferings } from '@agiworkforce/types';

import {
  acknowledgeProjectChatHandoff,
  HANDOFF_CARRIES_EVERY_COMPOSER_FIELD,
  PROJECT_CHAT_HANDOFF_KEY,
  PROJECT_CHAT_HANDOFF_MAX_AGE_MS,
  PROJECT_CHAT_HANDOFF_PARAM,
  projectChatHandoffHref,
  readProjectChatHandoff,
  saveProjectChatHandoff,
} from './project-chat-handoff';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

/**
 * Every field the composer can send, typed as the composer's own interface.
 *
 * The previous fixture was a bare object literal missing two fields, so it
 * agreed with a schema that was missing the same two, and the suite passed
 * while starting a chat inside a project failed for every user. Typing it as
 * `Required<ComposerSendMeta>` makes an omission a compile error here, and
 * `HANDOFF_CARRIES_EVERY_COMPOSER_FIELD` makes it one in the module.
 */
const meta: Required<ComposerSendMeta> = {
  workMode: 'agiwork',
  projectId: 'project-1',
  webSearchEnabled: true,
  thinkingEnabled: true,
  codeExecutionEnabled: true,
  officeCreationEnabled: true,
  officeOutputFormat: 'docx',
  researchEnabled: true,
  searchRequested: true,
  styleInstruction: 'Use a concise project brief.',
  artifactInstruction: 'Return a marked HTML artifact.',
  skillName: 'Planning',
  mcpContext: { resources: [{ connectorId: 'connector-1', uri: 'mcp://brief' }] },
  agiWorkGoal: { goal: 'Build the release plan', deliverable: 'A checked plan' },
  disabledConnectorIds: ['connector-2'],
  connectorToolsEnabled: true,
  memoryEnabled: false,
  queuedFollowUp: true,
  modelOverrideId: Object.entries(getProviderOfferings()).find(
    ([, offering]) => offering.quotaProbeProtocol === 'image-sync',
  )![0],
};

describe('project chat handoff', () => {
  it('carries every field the composer can send', () => {
    expect(HANDOFF_CARRIES_EVERY_COMPOSER_FIELD).toBe(true);
  });

  it('survives a composer field the schema has never heard of', () => {
    const storage = memoryStorage();
    let id = '';

    expect(() => {
      id = saveProjectChatHandoff(storage, {
        content: 'Start the project chat',
        projectId: 'project-1',
        meta: { ...meta, aFieldAddedTomorrow: true } as ComposerSendMeta,
      });
    }).not.toThrow();

    // Dropped rather than stored, and the send still happens. Rejecting the
    // whole handoff over an unknown key is what broke every project chat.
    const read = readProjectChatHandoff(storage, 'project-1', id);
    expect(read?.meta).not.toHaveProperty('aFieldAddedTomorrow');
    expect(read?.content).toBe('Start the project chat');
  });

  it('keeps the complete project send claimed until the durable acknowledgement', () => {
    const storage = memoryStorage();
    const attachment = new File(['evidence'], 'brief.txt', { type: 'text/plain' });
    const id = saveProjectChatHandoff(storage, {
      content: 'Build the release plan',
      projectId: 'project-1',
      attachments: [attachment],
      skillId: 'Planning',
      meta,
    });

    const first = readProjectChatHandoff(storage, 'project-1', id);
    expect(first).toMatchObject({
      id,
      content: 'Build the release plan',
      projectId: 'project-1',
      skillId: 'Planning',
      meta,
      attachmentsUnavailable: false,
      sendable: true,
    });
    expect(first?.userMessageId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(first?.assistantMessageId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(first?.attachments).toEqual([attachment]);
    expect(readProjectChatHandoff(storage, 'project-1', id)).toMatchObject({
      id,
      userMessageId: first?.userMessageId,
      assistantMessageId: first?.assistantMessageId,
    });

    acknowledgeProjectChatHandoff(storage, id);
    expect(readProjectChatHandoff(storage, 'project-1', id)).toBeNull();
  });

  it('snapshots the selected model into the handoff', () => {
    const storage = memoryStorage();
    const id = saveProjectChatHandoff(storage, {
      content: 'Plan',
      projectId: 'project-1',
      modelId: 'model-snapshot',
      meta,
    });
    expect(readProjectChatHandoff(storage, 'project-1', id)?.modelId).toBe('model-snapshot');
  });

  it('deletes and refuses a stale cross-project handoff', () => {
    const storage = memoryStorage();
    const id = saveProjectChatHandoff(storage, {
      content: 'Private project prompt',
      projectId: 'project-1',
      meta,
    });

    expect(readProjectChatHandoff(storage, 'project-2', id)).toBeNull();
    expect(readProjectChatHandoff(storage, 'project-1', id)).toBeNull();
  });

  it('waits for the destination project id without consuming the claim', () => {
    const storage = memoryStorage();
    const id = saveProjectChatHandoff(storage, {
      content: 'Keep me pending',
      projectId: 'project-1',
      meta,
    });
    expect(readProjectChatHandoff(storage, null, id)).toBeNull();
    expect(readProjectChatHandoff(storage, 'project-1', id)).toMatchObject({
      content: 'Keep me pending',
    });
  });

  it('links the chat page to the handoff it carries', () => {
    const href = projectChatHandoffHref('project 1', 'handoff-1');
    const url = new URL(href, 'http://localhost');
    expect(url.pathname).toBe('/chat');
    expect(url.searchParams.get('projectId')).toBe('project 1');
    expect(url.searchParams.get(PROJECT_CHAT_HANDOFF_PARAM)).toBe('handoff-1');
  });

  // Checked against the code before the expiry and the page binding: there
  // `sendable` did not exist, so every assertion on it below failed.
  it('may be sent only by the page the project page navigated to', () => {
    const storage = memoryStorage();
    const id = saveProjectChatHandoff(storage, {
      content: 'Send me from the page I was handed to',
      projectId: 'project-1',
      meta,
    });

    expect(readProjectChatHandoff(storage, 'project-1', 'another-handoff')?.sendable).toBe(false);
    expect(readProjectChatHandoff(storage, 'project-1', null)?.sendable).toBe(false);
    expect(readProjectChatHandoff(storage, 'project-1', id)?.sendable).toBe(true);
  });

  describe('once it has waited too long', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('is no longer sendable, but its draft can still be read back', () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-15T12:00:00.000Z') });
      const storage = memoryStorage();
      const id = saveProjectChatHandoff(storage, {
        content: 'An old draft that must not send itself',
        projectId: 'project-1',
        meta,
      });

      vi.advanceTimersByTime(PROJECT_CHAT_HANDOFF_MAX_AGE_MS);
      expect(readProjectChatHandoff(storage, 'project-1', id)?.sendable).toBe(true);

      vi.advanceTimersByTime(1);
      expect(readProjectChatHandoff(storage, 'project-1', id)).toMatchObject({
        content: 'An old draft that must not send itself',
        sendable: false,
      });
    });
  });

  it('fails visibly when session storage cannot own the handoff', () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new DOMException('Storage blocked', 'SecurityError');
    };
    expect(() =>
      saveProjectChatHandoff(storage, {
        content: 'Do not lose this',
        projectId: 'project-1',
        meta,
      }),
    ).toThrow('Storage blocked');
    expect(storage.getItem(PROJECT_CHAT_HANDOFF_KEY)).toBeNull();
  });
});
