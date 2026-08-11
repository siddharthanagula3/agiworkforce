import { describe, expect, it } from 'vitest';

import {
  acknowledgeProjectChatHandoff,
  PROJECT_CHAT_HANDOFF_KEY,
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

const meta = {
  workMode: 'agiwork' as const,
  projectId: 'project-1',
  webSearchEnabled: true,
  thinkingEnabled: true,
  codeExecutionEnabled: true,
  styleInstruction: 'Use a concise project brief.',
  agiWorkGoal: { goal: 'Build the release plan', deliverable: 'A checked plan' },
};

describe('project chat handoff', () => {
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

    const first = readProjectChatHandoff(storage, 'project-1');
    expect(first).toMatchObject({
      id,
      content: 'Build the release plan',
      projectId: 'project-1',
      skillId: 'Planning',
      meta,
      attachmentsUnavailable: false,
    });
    expect(first?.userMessageId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(first?.assistantMessageId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(first?.attachments).toEqual([attachment]);
    expect(readProjectChatHandoff(storage, 'project-1')).toMatchObject({
      id,
      userMessageId: first?.userMessageId,
      assistantMessageId: first?.assistantMessageId,
    });

    acknowledgeProjectChatHandoff(storage, id);
    expect(readProjectChatHandoff(storage, 'project-1')).toBeNull();
  });

  it('deletes and refuses a stale cross-project handoff', () => {
    const storage = memoryStorage();
    saveProjectChatHandoff(storage, {
      content: 'Private project prompt',
      projectId: 'project-1',
      meta,
    });

    expect(readProjectChatHandoff(storage, 'project-2')).toBeNull();
    expect(readProjectChatHandoff(storage, 'project-1')).toBeNull();
  });

  it('waits for the destination project id without consuming the claim', () => {
    const storage = memoryStorage();
    saveProjectChatHandoff(storage, {
      content: 'Keep me pending',
      projectId: 'project-1',
      meta,
    });
    expect(readProjectChatHandoff(storage, null)).toBeNull();
    expect(readProjectChatHandoff(storage, 'project-1')).toMatchObject({
      content: 'Keep me pending',
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
