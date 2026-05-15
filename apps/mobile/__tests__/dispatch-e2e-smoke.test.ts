/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * dispatch-e2e-smoke.test.ts
 *
 * End-to-end smoke test for the Dispatch send→receive round-trip.
 *
 * Flow under test:
 *   1. Mobile calls sendTask(text) — captured by mocked sendControl/queueControl
 *   2. Bridge delivers the dispatch_task payload to the desktop (verified via mock)
 *   3. Desktop sends back dispatch_response (simulated by calling addMessage directly,
 *      mirroring what connectionStore.handleControlMessageInner does for 'dispatch_response')
 *   4. dispatchStore reflects the incoming desktop message
 *
 * This smoke validates:
 *  - Outgoing dispatch_task payload shape (action, text, messageId)
 *  - Payload arrives via sendControl when connected / queueControl when disconnected
 *  - Incoming dispatch_response is reflected in the thread with role:'desktop'
 *  - Round-trip: user message → thread → desktop response → thread update
 *  - Streaming status update (dispatch_status_update) patches the existing message
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before any imports
// ---------------------------------------------------------------------------

jest.mock('../lib/mmkv', () => ({
  mmkvStorage: {
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const mockSendControl = jest.fn();
const mockQueueControl = jest.fn();

jest.mock('../stores/connectionStore', () => ({
  useConnectionStore: {
    getState: jest.fn().mockReturnValue({
      status: 'connected',
      sendControl: mockSendControl,
      queueControl: mockQueueControl,
    }),
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { useDispatchStore, type DispatchMessage } from '../stores/dispatchStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getState() {
  return useDispatchStore.getState();
}

function resetStore() {
  useDispatchStore.setState({ messages: [] });
}

/** Simulate what connectionStore.handleControlMessageInner does for 'dispatch_response'. */
function simulateDesktopResponse(params: {
  messageId: string;
  text: string;
  taskStatus?: DispatchMessage['taskStatus'];
  statusDetail?: string;
  taskResult?: DispatchMessage['taskResult'];
}) {
  const msg: DispatchMessage = {
    id: params.messageId,
    role: 'desktop',
    text: params.text,
    timestamp: new Date().toISOString(),
    taskStatus: params.taskStatus,
    statusDetail: params.statusDetail,
    taskResult: params.taskResult,
  };
  useDispatchStore.getState().addMessage(msg);
}

/** Simulate what handleControlMessageInner does for 'dispatch_status_update'. */
function simulateStatusUpdate(messageId: string, patch: Partial<Omit<DispatchMessage, 'id'>>) {
  useDispatchStore.getState().updateMessage(messageId, patch);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dispatch e2e smoke — send→receive round-trip', () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
    const { useConnectionStore } = require('../stores/connectionStore');
    useConnectionStore.getState.mockReturnValue({
      status: 'connected',
      sendControl: mockSendControl,
      queueControl: mockQueueControl,
    });
  });

  // ---- 1. Outgoing payload shape ----

  describe('outgoing dispatch_task payload', () => {
    it('sendTask emits dispatch_task via sendControl when connected', () => {
      getState().sendTask('Run the nightly report');

      expect(mockSendControl).toHaveBeenCalledTimes(1);
      expect(mockSendControl).toHaveBeenCalledWith(
        'dispatch_task',
        expect.objectContaining({
          text: 'Run the nightly report',
        }),
      );
    });

    it('dispatch_task payload includes a non-empty messageId string', () => {
      getState().sendTask('Summarise logs');

      const [, payload] = mockSendControl.mock.calls[0] as [string, { messageId?: unknown }];
      expect(typeof payload.messageId).toBe('string');
      expect((payload.messageId as string).length).toBeGreaterThan(0);
    });

    it('dispatch_task payload action name is dispatch_task', () => {
      getState().sendTask('Check CI');

      const [action] = mockSendControl.mock.calls[0] as [string, unknown];
      expect(action).toBe('dispatch_task');
    });

    it('sends via queueControl when disconnected', () => {
      const { useConnectionStore } = require('../stores/connectionStore');
      useConnectionStore.getState.mockReturnValue({
        status: 'disconnected',
        sendControl: mockSendControl,
        queueControl: mockQueueControl,
      });

      getState().sendTask('Offline task');

      expect(mockSendControl).not.toHaveBeenCalled();
      expect(mockQueueControl).toHaveBeenCalledWith(
        'dispatch_task',
        expect.objectContaining({ text: 'Offline task' }),
      );
    });
  });

  // ---- 2. Incoming dispatch_response ----

  describe('incoming dispatch_response → dispatchStore', () => {
    it('desktop response lands in the thread with role desktop', () => {
      simulateDesktopResponse({ messageId: 'resp-1', text: 'Done. Report generated.' });

      const messages = getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0]!.role).toBe('desktop');
      expect(messages[0]!.text).toBe('Done. Report generated.');
    });

    it('desktop response with taskStatus is reflected correctly', () => {
      simulateDesktopResponse({
        messageId: 'resp-2',
        text: 'Working on it...',
        taskStatus: 'working',
        statusDetail: 'Fetching logs...',
      });

      const msg = getState().messages[0]!;
      expect(msg.taskStatus).toBe('working');
      expect(msg.statusDetail).toBe('Fetching logs...');
    });

    it('completed desktop response includes taskResult', () => {
      simulateDesktopResponse({
        messageId: 'resp-3',
        text: 'Report ready.',
        taskStatus: 'completed',
        taskResult: { fileName: 'report.pdf', summary: 'Q1 results', location: '/docs/' },
      });

      const msg = getState().messages[0]!;
      expect(msg.taskStatus).toBe('completed');
      expect(msg.taskResult?.fileName).toBe('report.pdf');
      expect(msg.taskResult?.summary).toBe('Q1 results');
    });
  });

  // ---- 3. Full round-trip ----

  describe('full round-trip: user send → desktop response', () => {
    it('thread shows user message then desktop response in order', () => {
      // Mobile sends task
      getState().sendTask('Analyse sales data');

      // Capture the messageId from the outgoing payload
      const [, outPayload] = mockSendControl.mock.calls[0] as [string, { messageId: string }];
      const outgoingMessageId = outPayload.messageId;

      // Desktop acknowledges by sending back dispatch_response
      simulateDesktopResponse({
        messageId: outgoingMessageId + '-resp',
        text: 'Starting analysis...',
        taskStatus: 'working',
      });

      const messages = getState().messages;
      expect(messages).toHaveLength(2);
      expect(messages[0]!.role).toBe('user');
      expect(messages[0]!.text).toBe('Analyse sales data');
      expect(messages[1]!.role).toBe('desktop');
      expect(messages[1]!.taskStatus).toBe('working');
    });

    it('status update patches desktop message without duplicating it', () => {
      // Mobile sends task
      getState().sendTask('Build weekly digest');

      const responseId = 'digest-resp-1';

      // Desktop starts working
      simulateDesktopResponse({
        messageId: responseId,
        text: 'Starting...',
        taskStatus: 'working',
      });

      // Desktop sends a status update mid-execution
      simulateStatusUpdate(responseId, {
        taskStatus: 'working',
        statusDetail: 'Compiling articles...',
        text: 'Compiling...',
      });

      // Desktop completes
      simulateStatusUpdate(responseId, {
        taskStatus: 'completed',
        statusDetail: 'Done',
        text: 'Digest ready.',
        taskResult: { fileName: 'digest.md', summary: '5 articles' },
      });

      const messages = getState().messages;
      // Still only 2 messages (user + desktop), no duplicates
      expect(messages).toHaveLength(2);

      const desktopMsg = messages.find((m) => m.id === responseId)!;
      expect(desktopMsg.taskStatus).toBe('completed');
      expect(desktopMsg.text).toBe('Digest ready.');
      expect(desktopMsg.taskResult?.fileName).toBe('digest.md');
    });

    it('multiple concurrent tasks land as separate messages', () => {
      getState().sendTask('Task one');
      getState().sendTask('Task two');

      simulateDesktopResponse({ messageId: 'resp-one', text: 'Response to one' });
      simulateDesktopResponse({ messageId: 'resp-two', text: 'Response to two' });

      const messages = getState().messages;
      expect(messages).toHaveLength(4); // 2 user + 2 desktop
      expect(messages.filter((m) => m.role === 'user')).toHaveLength(2);
      expect(messages.filter((m) => m.role === 'desktop')).toHaveLength(2);
    });
  });

  // ---- 4. Payload format contract (what desktop expects) ----

  describe('dispatch_task wire format — desktop contract', () => {
    it('payload text matches the user input string exactly', () => {
      const text = 'Generate a monthly usage report for May 2026';
      getState().sendTask(text);

      const [, payload] = mockSendControl.mock.calls[0] as [string, { text: string }];
      expect(payload.text).toBe(text);
    });

    it('consecutive tasks have unique messageIds', () => {
      getState().sendTask('First');
      getState().sendTask('Second');

      const id1 = (mockSendControl.mock.calls[0] as [string, { messageId: string }])[1].messageId;
      const id2 = (mockSendControl.mock.calls[1] as [string, { messageId: string }])[1].messageId;
      expect(id1).not.toBe(id2);
    });
  });
});
