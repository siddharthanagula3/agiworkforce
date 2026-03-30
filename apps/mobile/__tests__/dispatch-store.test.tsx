/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Tests for dispatchStore.
 *
 * Validates the Dispatch thread state management:
 * - addMessage adds to thread
 * - updateMessage patches existing messages
 * - sendTask adds user message to thread
 * - clearThread empties the messages array
 * - Messages persist via MMKV (verified via partialize config)
 */

// ---------------------------------------------------------------------------
// Mocks — declared before imports
// ---------------------------------------------------------------------------

jest.mock('../lib/mmkv', () => ({
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock('../stores/connectionStore', () => ({
  useConnectionStore: {
    getState: jest.fn().mockReturnValue({
      status: 'disconnected',
      sendControl: jest.fn(),
      queueControl: jest.fn(),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { useDispatchStore, type DispatchMessage } from '../stores/dispatchStore';

let consoleWarnSpy: jest.SpyInstance;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getState() {
  return useDispatchStore.getState();
}

function resetStore() {
  useDispatchStore.setState({ messages: [] });
}

function makeMessage(overrides: Partial<DispatchMessage> = {}): DispatchMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role: 'user',
    text: 'Test message',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dispatchStore', () => {
  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    resetStore();
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  // ---- addMessage ----

  describe('addMessage', () => {
    it('adds a message to the thread', () => {
      const msg = makeMessage({ text: 'Hello desktop' });

      getState().addMessage(msg);

      const messages = getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0]!.text).toBe('Hello desktop');
    });

    it('adds multiple messages in order', () => {
      const msg1 = makeMessage({ id: 'msg-1', text: 'First' });
      const msg2 = makeMessage({ id: 'msg-2', text: 'Second' });

      getState().addMessage(msg1);
      getState().addMessage(msg2);

      const messages = getState().messages;
      expect(messages).toHaveLength(2);
      expect(messages[0]!.text).toBe('First');
      expect(messages[1]!.text).toBe('Second');
    });

    it('preserves message fields (role, taskStatus, taskResult)', () => {
      const msg = makeMessage({
        role: 'desktop',
        taskStatus: 'completed',
        statusDetail: 'Done processing',
        taskResult: { fileName: 'report.pdf', summary: 'Generated report' },
      });

      getState().addMessage(msg);

      const stored = getState().messages[0]!;
      expect(stored.role).toBe('desktop');
      expect(stored.taskStatus).toBe('completed');
      expect(stored.statusDetail).toBe('Done processing');
      expect(stored.taskResult?.fileName).toBe('report.pdf');
    });
  });

  // ---- updateMessage ----

  describe('updateMessage', () => {
    it('updates an existing message by ID', () => {
      const msg = makeMessage({ id: 'msg-to-update', text: 'Original' });
      getState().addMessage(msg);

      getState().updateMessage('msg-to-update', { text: 'Updated' });

      const updated = getState().messages[0]!;
      expect(updated.text).toBe('Updated');
      expect(updated.id).toBe('msg-to-update');
    });

    it('updates only the specified fields (partial patch)', () => {
      const msg = makeMessage({
        id: 'msg-patch',
        text: 'Task request',
        taskStatus: 'pending',
      });
      getState().addMessage(msg);

      getState().updateMessage('msg-patch', {
        taskStatus: 'working',
        statusDetail: 'Searching...',
      });

      const patched = getState().messages[0]!;
      expect(patched.text).toBe('Task request'); // unchanged
      expect(patched.taskStatus).toBe('working'); // updated
      expect(patched.statusDetail).toBe('Searching...'); // added
    });

    it('does not modify other messages in the thread', () => {
      const msg1 = makeMessage({ id: 'msg-1', text: 'First' });
      const msg2 = makeMessage({ id: 'msg-2', text: 'Second' });
      getState().addMessage(msg1);
      getState().addMessage(msg2);

      getState().updateMessage('msg-2', { text: 'Second updated' });

      const messages = getState().messages;
      expect(messages[0]!.text).toBe('First'); // untouched
      expect(messages[1]!.text).toBe('Second updated');
    });

    it('is a no-op when message ID does not exist', () => {
      const msg = makeMessage({ id: 'msg-existing' });
      getState().addMessage(msg);

      getState().updateMessage('msg-nonexistent', { text: 'Ghost' });

      const messages = getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0]!.text).toBe('Test message');
    });
  });

  // ---- sendTask ----

  describe('sendTask', () => {
    it('adds a user message to the thread', () => {
      getState().sendTask('Run the report');

      const messages = getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0]!.role).toBe('user');
      expect(messages[0]!.text).toBe('Run the report');
    });

    it('generates a unique message ID', () => {
      getState().sendTask('Task 1');
      getState().sendTask('Task 2');

      const messages = getState().messages;
      expect(messages[0]!.id).toBeTruthy();
      expect(messages[1]!.id).toBeTruthy();
      expect(messages[0]!.id).not.toBe(messages[1]!.id);
    });

    it('includes a timestamp on the user message', () => {
      getState().sendTask('Timed task');

      const msg = getState().messages[0]!;
      expect(msg.timestamp).toBeTruthy();
      // Verify it is a valid ISO date string
      expect(new Date(msg.timestamp).toISOString()).toBe(msg.timestamp);
    });

    it('queues the control message when disconnected', () => {
      const { useConnectionStore } = require('../stores/connectionStore');
      const mockQueueControl = jest.fn();
      useConnectionStore.getState.mockReturnValue({
        status: 'disconnected',
        sendControl: jest.fn(),
        queueControl: mockQueueControl,
      });

      getState().sendTask('Queued task');

      expect(mockQueueControl).toHaveBeenCalledWith(
        'dispatch_task',
        expect.objectContaining({
          text: 'Queued task',
        }),
      );
    });

    it('sends control message directly when connected', () => {
      const { useConnectionStore } = require('../stores/connectionStore');
      const mockSendControl = jest.fn();
      useConnectionStore.getState.mockReturnValue({
        status: 'connected',
        sendControl: mockSendControl,
        queueControl: jest.fn(),
      });

      getState().sendTask('Direct task');

      expect(mockSendControl).toHaveBeenCalledWith(
        'dispatch_task',
        expect.objectContaining({
          text: 'Direct task',
        }),
      );
    });
  });

  // ---- clearThread ----

  describe('clearThread', () => {
    it('empties the messages array', () => {
      getState().addMessage(makeMessage({ text: 'A' }));
      getState().addMessage(makeMessage({ text: 'B' }));
      expect(getState().messages).toHaveLength(2);

      getState().clearThread();

      expect(getState().messages).toHaveLength(0);
    });

    it('is safe to call when already empty', () => {
      expect(() => getState().clearThread()).not.toThrow();
      expect(getState().messages).toHaveLength(0);
    });
  });

  // ---- Persistence ----

  describe('persistence', () => {
    it('store uses MMKV persistence with name "dispatch-store"', () => {
      // The store is configured with persist middleware using 'dispatch-store'
      // as the storage key. We verify the persist config by checking
      // the store has the persist API (getStorage, rehydrate, etc.)
      const store = useDispatchStore;
      expect(store.persist).toBeDefined();
      expect(store.persist.getOptions().name).toBe('dispatch-store');
    });

    it('partialize only persists messages', () => {
      const options = useDispatchStore.persist.getOptions();
      const fullState = {
        messages: [makeMessage()],
        addMessage: jest.fn(),
        updateMessage: jest.fn(),
        sendTask: jest.fn(),
        clearThread: jest.fn(),
      };

      const partialState = options.partialize!(fullState as never);

      expect(partialState).toEqual({ messages: fullState.messages });
      expect(partialState).not.toHaveProperty('addMessage');
      expect(partialState).not.toHaveProperty('clearThread');
    });
  });
});
