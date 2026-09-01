import { beforeEach, describe, expect, it } from 'vitest';
import {
  useChatStore,
  selectActiveLeafId,
  selectConversationAllRows,
  selectConversationMessages,
  type Message,
} from './web-chat-store';

const CONVERSATION_ID = 'conv-thread';
const OTHER_CONVERSATION_ID = 'conv-other';
const BASE_TIME = Date.parse('2026-09-01T10:00:00.000Z');

function message(
  id: string,
  options: { parentId?: string | null; minute?: number; role?: Message['role'] } = {},
): Message {
  return {
    id,
    role: options.role ?? 'user',
    content: id,
    createdAt: new Date(BASE_TIME + (options.minute ?? 0) * 60_000).toISOString(),
    ...(options.parentId === undefined ? {} : { parentId: options.parentId }),
  };
}

const linearRows = () => [
  message('u1', { minute: 0 }),
  message('a1', { minute: 1, role: 'assistant' }),
  message('u2', { minute: 2 }),
  message('a2', { minute: 3, role: 'assistant' }),
];

describe('web chat store — message thread', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('mirrors a conversation with no leaf by identity, so nothing re-renders on load', () => {
    const rows = linearRows();
    useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, rows);

    expect(useChatStore.getState().messages).toBe(rows);
    expect(selectConversationMessages(CONVERSATION_ID)(useChatStore.getState())).toBe(rows);
    expect(selectActiveLeafId(CONVERSATION_ID)(useChatStore.getState())).toBeNull();
  });

  it('adopts the leaf the loader hands in with the rows', () => {
    const rows = [
      message('u1', { parentId: null, minute: 0 }),
      message('a1', { parentId: 'u1', minute: 1, role: 'assistant' }),
      message('a1b', { parentId: 'u1', minute: 2, role: 'assistant' }),
    ];

    useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, rows, 'a1');

    expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['u1', 'a1']);
    expect(selectConversationAllRows(CONVERSATION_ID)(useChatStore.getState())).toHaveLength(3);
  });

  it('keeps the bucket whole while the mirror shows only the active path', () => {
    const store = useChatStore.getState();
    store.setActiveConversationWithMessages(CONVERSATION_ID, [
      message('u1', { parentId: null, minute: 0 }),
      message('a1', { parentId: 'u1', minute: 1, role: 'assistant' }),
    ]);
    store.setActiveLeaf(CONVERSATION_ID, 'a1');
    store.addMessage(message('a1b', { parentId: 'u1', minute: 2, role: 'assistant' }));

    expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['u1', 'a1']);
    expect(
      selectConversationAllRows(CONVERSATION_ID)(useChatStore.getState()).map((m) => m.id),
    ).toEqual(['u1', 'a1', 'a1b']);
  });

  it('swaps the visible path when the leaf moves to the other variant', () => {
    const store = useChatStore.getState();
    store.setActiveConversationWithMessages(
      CONVERSATION_ID,
      [
        message('u1', { parentId: null, minute: 0 }),
        message('a1', { parentId: 'u1', minute: 1, role: 'assistant' }),
        message('a1b', { parentId: 'u1', minute: 2, role: 'assistant' }),
      ],
      'a1',
    );

    useChatStore.getState().setActiveLeaf(CONVERSATION_ID, 'a1b');

    expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['u1', 'a1b']);
  });

  it('leaves the mirror alone when the leaf named is the one already active', () => {
    const store = useChatStore.getState();
    store.setActiveConversationWithMessages(CONVERSATION_ID, linearRows(), 'a2');
    const before = useChatStore.getState().messages;

    useChatStore.getState().setActiveLeaf(CONVERSATION_ID, 'a2');

    expect(useChatStore.getState().messages).toBe(before);
  });

  it('does not touch the visible transcript when a background conversation branches', () => {
    const store = useChatStore.getState();
    store.setActiveConversationWithMessages(CONVERSATION_ID, linearRows());
    store.setMessages(
      [
        message('b1', { parentId: null, minute: 0 }),
        message('b2', { parentId: 'b1', minute: 1, role: 'assistant' }),
      ],
      OTHER_CONVERSATION_ID,
    );
    const visible = useChatStore.getState().messages;

    useChatStore.getState().setActiveLeaf(OTHER_CONVERSATION_ID, 'b1');

    expect(useChatStore.getState().messages).toBe(visible);
    expect(
      selectConversationMessages(OTHER_CONVERSATION_ID)(useChatStore.getState()).map((m) => m.id),
    ).toEqual(['b1']);
  });

  /**
   * The client mirror of the server's conversion has to chain on the same key,
   * or the same edit produces one tree on screen and a different one in the row
   * the server writes.
   */
  it('stamps local parents in (created_at, id) order, matching the server backfill', () => {
    const store = useChatStore.getState();
    store.setActiveConversationWithMessages(CONVERSATION_ID, linearRows());

    useChatStore.getState().ensureLocalThreadParents(CONVERSATION_ID);

    expect(
      selectConversationAllRows(CONVERSATION_ID)(useChatStore.getState()).map((m) => [
        m.id,
        m.parentId ?? null,
      ]),
    ).toEqual([
      ['u1', null],
      ['a1', 'u1'],
      ['u2', 'a1'],
      ['a2', 'u2'],
    ]);
  });

  it('leaves the bucket identity alone when there is nothing to stamp', () => {
    const store = useChatStore.getState();
    store.setActiveConversationWithMessages(CONVERSATION_ID, [
      message('u1', { parentId: null, minute: 0 }),
      message('a1', { parentId: 'u1', minute: 1, role: 'assistant' }),
    ]);
    const before = selectConversationAllRows(CONVERSATION_ID)(useChatStore.getState());

    useChatStore.getState().ensureLocalThreadParents(CONVERSATION_ID);

    expect(selectConversationAllRows(CONVERSATION_ID)(useChatStore.getState())).toBe(before);
  });

  it('stamping does not make a linear conversation render differently', () => {
    const store = useChatStore.getState();
    store.setActiveConversationWithMessages(CONVERSATION_ID, linearRows());

    useChatStore.getState().ensureLocalThreadParents(CONVERSATION_ID);

    expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['u1', 'a1', 'u2', 'a2']);
  });

  describe('revealMessage', () => {
    const branched = () => [
      message('u1', { parentId: null, minute: 0 }),
      message('a1', { parentId: 'u1', minute: 1, role: 'assistant' }),
      message('a1b', { parentId: 'u1', minute: 2, role: 'assistant' }),
      message('u2', { parentId: 'a1b', minute: 3 }),
    ];

    it('moves the path onto an off-path message and follows its tail', () => {
      useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, branched(), 'a1');

      useChatStore.getState().revealMessage('a1b', CONVERSATION_ID);

      expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['u1', 'a1b', 'u2']);
    });

    it('is a no-op for a message that is already visible', () => {
      useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, branched(), 'a1');
      const before = useChatStore.getState().messages;

      useChatStore.getState().revealMessage('a1', CONVERSATION_ID);

      expect(useChatStore.getState().messages).toBe(before);
    });

    it('costs a linear conversation nothing', () => {
      useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, linearRows());
      const before = useChatStore.getState().messages;

      useChatStore.getState().revealMessage('u2', CONVERSATION_ID);

      expect(useChatStore.getState().messages).toBe(before);
      expect(selectActiveLeafId(CONVERSATION_ID)(useChatStore.getState())).toBeNull();
    });

    it('ignores an id this conversation has never loaded', () => {
      useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, branched(), 'a1');
      const before = useChatStore.getState().messages;

      useChatStore.getState().revealMessage('never-loaded', CONVERSATION_ID);

      expect(useChatStore.getState().messages).toBe(before);
    });
  });

  it('drops a deleted conversation leaf so a recreated id cannot inherit it', () => {
    const store = useChatStore.getState();
    store.setActiveConversationWithMessages(CONVERSATION_ID, linearRows(), 'a2');

    useChatStore.getState().deleteConversation(CONVERSATION_ID);

    expect(selectActiveLeafId(CONVERSATION_ID)(useChatStore.getState())).toBeNull();
  });

  it('resolves the path of the conversation that stays when another is deleted', () => {
    const store = useChatStore.getState();
    store.setMessages(
      [
        message('u1', { parentId: null, minute: 0 }),
        message('a1', { parentId: 'u1', minute: 1, role: 'assistant' }),
        message('a1b', { parentId: 'u1', minute: 2, role: 'assistant' }),
      ],
      OTHER_CONVERSATION_ID,
    );
    store.setActiveLeaf(OTHER_CONVERSATION_ID, 'a1');
    store.setActiveConversationWithMessages(OTHER_CONVERSATION_ID, [
      message('u1', { parentId: null, minute: 0 }),
      message('a1', { parentId: 'u1', minute: 1, role: 'assistant' }),
      message('a1b', { parentId: 'u1', minute: 2, role: 'assistant' }),
    ]);
    store.addConversation({
      id: CONVERSATION_ID,
      title: 'other',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-01T10:00:00.000Z',
    });

    useChatStore.getState().deleteConversation(CONVERSATION_ID);

    expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['u1', 'a1']);
  });

  /**
   * WebChatPage subscribes with this one. A fresh array per call would be a new
   * snapshot on every unrelated store write, and through useSyncExternalStore a
   * loop rather than a re-render.
   */
  it('answers an unloaded conversation with a stable empty array', () => {
    const first = selectConversationAllRows('never-loaded')(useChatStore.getState());
    const second = selectConversationAllRows('never-loaded')(useChatStore.getState());

    expect(first).toBe(second);
    expect(selectConversationAllRows(null)(useChatStore.getState())).toBe(first);
    expect(selectConversationMessages(null)(useChatStore.getState())).toBe(first);
  });

  it('re-resolves the path when the conversation is re-activated', () => {
    const store = useChatStore.getState();
    store.setActiveConversationWithMessages(
      CONVERSATION_ID,
      [
        message('u1', { parentId: null, minute: 0 }),
        message('a1', { parentId: 'u1', minute: 1, role: 'assistant' }),
        message('a1b', { parentId: 'u1', minute: 2, role: 'assistant' }),
      ],
      'a1',
    );
    store.setActiveConversation(null);

    useChatStore.getState().setActiveConversation(CONVERSATION_ID);

    expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['u1', 'a1']);
  });
});

describe('web chat store — deleting a message from the tree', () => {
  const branched = () => [
    message('u1', { parentId: null, minute: 0 }),
    message('a1', { parentId: 'u1', minute: 1, role: 'assistant' }),
    message('a1b', { parentId: 'u1', minute: 2, role: 'assistant' }),
    message('u2', { parentId: 'a1b', minute: 3 }),
    message('a2', { parentId: 'u2', minute: 4, role: 'assistant' }),
  ];

  beforeEach(() => {
    useChatStore.getState().reset();
  });

  describe('deleteMessage (splice)', () => {
    it('hands the deleted row children to its own parent, so the turns close up', () => {
      useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, branched(), 'a2');

      useChatStore.getState().deleteMessage('u2', CONVERSATION_ID);

      expect(
        selectConversationAllRows(CONVERSATION_ID)(useChatStore.getState()).map((m) => [
          m.id,
          m.parentId ?? null,
        ]),
      ).toEqual([
        ['u1', null],
        ['a1', 'u1'],
        ['a1b', 'u1'],
        ['a2', 'a1b'],
      ]);
      expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['u1', 'a1b', 'a2']);
    });

    it('moves a reader standing on the deleted row up to its parent', () => {
      useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, branched(), 'a2');

      useChatStore.getState().deleteMessage('a2', CONVERSATION_ID);

      expect(selectActiveLeafId(CONVERSATION_ID)(useChatStore.getState())).toBe('u2');
      expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['u1', 'a1b', 'u2']);
    });

    it('leaves a reader standing anywhere else where they are', () => {
      useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, branched(), 'a2');

      useChatStore.getState().deleteMessage('a1', CONVERSATION_ID);

      expect(selectActiveLeafId(CONVERSATION_ID)(useChatStore.getState())).toBe('a2');
      expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['u1', 'a1b', 'u2', 'a2']);
    });

    it('costs a linear conversation nothing but the row', () => {
      useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, linearRows());

      useChatStore.getState().deleteMessage('u2', CONVERSATION_ID);

      expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['u1', 'a1', 'a2']);
      expect(selectActiveLeafId(CONVERSATION_ID)(useChatStore.getState())).toBeNull();
    });

    it('leaves the bucket identity alone for an id this conversation never had', () => {
      useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, branched(), 'a2');
      const before = selectConversationAllRows(CONVERSATION_ID)(useChatStore.getState());

      useChatStore.getState().deleteMessage('never-loaded', CONVERSATION_ID);

      expect(selectConversationAllRows(CONVERSATION_ID)(useChatStore.getState())).toBe(before);
    });

    it('deletes out of the conversation named, not the one on screen', () => {
      const store = useChatStore.getState();
      store.setMessages(branched(), OTHER_CONVERSATION_ID);
      store.setActiveLeaf(OTHER_CONVERSATION_ID, 'a2');
      store.setActiveConversationWithMessages(CONVERSATION_ID, linearRows());
      const visible = useChatStore.getState().messages;

      useChatStore.getState().deleteMessage('a2', OTHER_CONVERSATION_ID);

      expect(useChatStore.getState().messages).toBe(visible);
      expect(selectActiveLeafId(OTHER_CONVERSATION_ID)(useChatStore.getState())).toBe('u2');
    });
  });

  describe('deleteMessageSubtree', () => {
    it('takes the variant with everything that continued from it', () => {
      useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, branched(), 'a2');

      useChatStore.getState().deleteMessageSubtree('a1b', 'a1', CONVERSATION_ID);

      expect(
        selectConversationAllRows(CONVERSATION_ID)(useChatStore.getState()).map((m) => m.id),
      ).toEqual(['u1', 'a1']);
      expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['u1', 'a1']);
    });

    it('lands the reader on the leaf the route settled on, not on a local guess', () => {
      const rows = [
        message('u1', { parentId: null, minute: 0 }),
        message('a1', { parentId: 'u1', minute: 1, role: 'assistant' }),
        message('a1b', { parentId: 'u1', minute: 2, role: 'assistant' }),
        message('a1c', { parentId: 'u1', minute: 3, role: 'assistant' }),
      ];
      useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, rows, 'a1c');

      useChatStore.getState().deleteMessageSubtree('a1c', 'a1', CONVERSATION_ID);

      expect(selectActiveLeafId(CONVERSATION_ID)(useChatStore.getState())).toBe('a1');
      expect(useChatStore.getState().messages.map((m) => m.id)).toEqual(['u1', 'a1']);
    });

    it('returns the conversation to its linear reading when the route answers null', () => {
      useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, branched(), 'a2');

      useChatStore.getState().deleteMessageSubtree('u1', null, CONVERSATION_ID);

      expect(selectActiveLeafId(CONVERSATION_ID)(useChatStore.getState())).toBeNull();
      expect(useChatStore.getState().messages).toEqual([]);
    });

    it('leaves the bucket identity alone for an id this conversation never had', () => {
      useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, branched(), 'a2');
      const before = selectConversationAllRows(CONVERSATION_ID)(useChatStore.getState());

      useChatStore.getState().deleteMessageSubtree('never-loaded', 'a2', CONVERSATION_ID);

      expect(selectConversationAllRows(CONVERSATION_ID)(useChatStore.getState())).toBe(before);
    });

    it('does not touch the visible transcript when a background conversation loses a variant', () => {
      const store = useChatStore.getState();
      store.setMessages(branched(), OTHER_CONVERSATION_ID);
      store.setActiveLeaf(OTHER_CONVERSATION_ID, 'a2');
      store.setActiveConversationWithMessages(CONVERSATION_ID, linearRows());
      const visible = useChatStore.getState().messages;

      useChatStore.getState().deleteMessageSubtree('a1b', 'a1', OTHER_CONVERSATION_ID);

      expect(useChatStore.getState().messages).toBe(visible);
      expect(
        selectConversationAllRows(OTHER_CONVERSATION_ID)(useChatStore.getState()).map((m) => m.id),
      ).toEqual(['u1', 'a1']);
    });
  });
});
