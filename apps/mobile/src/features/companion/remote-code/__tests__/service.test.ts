const mockSendControl = jest.fn(async () => true);
let mockStatus = 'connected';

jest.mock('@/stores/connectionStore', () => ({
  useConnectionStore: { getState: () => ({ sendControl: mockSendControl, status: mockStatus }) },
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-from-expo' }));

import { answerCodeApproval, attachCodeSession, steerCodeSession } from '../service';

beforeEach(() => {
  mockSendControl.mockClear();
  mockStatus = 'connected';
});

describe('remote code requests from the phone', () => {
  it('attaches with a request id and protocol version the host validates', async () => {
    await expect(attachCodeSession('root-1', 'thread-1')).resolves.toBe(true);
    expect(mockSendControl).toHaveBeenCalledWith(
      'code.session.attach',
      expect.objectContaining({
        rootId: 'root-1',
        threadId: 'thread-1',
        version: 1,
        requestId: expect.any(String),
        sentAt: expect.any(String),
      }),
    );
  });

  it('sends an approval answer for the exact approval shown', async () => {
    await answerCodeApproval('root-1', 'thread-1', 'turn-1', 'ap-1', false);
    expect(mockSendControl).toHaveBeenCalledWith(
      'code.approval.respond',
      expect.objectContaining({ turnId: 'turn-1', approvalRequestId: 'ap-1', approved: false }),
    );
  });

  it('refuses empty guidance and sends nothing while disconnected', async () => {
    await expect(steerCodeSession('root-1', 'thread-1', '   ', false)).resolves.toBe(false);
    mockStatus = 'stale';
    await expect(steerCodeSession('root-1', 'thread-1', 'skip docs', true)).resolves.toBe(false);
    expect(mockSendControl).not.toHaveBeenCalled();
  });
});
