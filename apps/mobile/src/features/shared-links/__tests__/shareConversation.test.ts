const mockAlert = jest.fn();
const mockShare = jest.fn();
const mockCreate = jest.fn();
const mockRevoke = jest.fn();

jest.mock('react-native', () => ({
  Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
  Share: { share: (...args: unknown[]) => mockShare(...args) },
}));
jest.mock('../service', () => ({
  createSharedLink: (...args: unknown[]) => mockCreate(...args),
  revokeSharedLink: (...args: unknown[]) => mockRevoke(...args),
}));
jest.mock('@/services/userMessage', () => ({ toUserMessage: () => 'Try again.' }));

import { confirmShareConversation } from '../shareConversation';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function confirm(isCurrent: () => boolean) {
  confirmShareConversation({
    conversationId: 'conversation-a', title: 'A', modelId: null,
    readMessages: () => [{ role: 'user', content: 'Original text' }], isCurrent,
  });
  const buttons = mockAlert.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
  buttons.find((button) => button.text === 'Create link')!.onPress!();
}

const link = { shareUrl: 'https://agiworkforce.com/share/original' };

describe('confirmed share completion ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockShare.mockResolvedValue({ action: 'sharedAction' });
  });

  it('shares the original link when the caller remains current', async () => {
    mockCreate.mockResolvedValue(link);
    confirm(() => true);
    await flush();
    expect(mockShare).toHaveBeenCalledWith({ message: link.shareUrl, url: link.shareUrl });
  });

  it('does not open native Share or revoke a created link after ownership retires', async () => {
    const pending = deferred<typeof link>();
    mockCreate.mockReturnValue(pending.promise);
    let current = true;
    confirm(() => current);
    await flush();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    current = false;
    pending.resolve(link);
    await flush();
    expect(mockShare).not.toHaveBeenCalled();
    expect(mockRevoke).not.toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledTimes(1);
  });

  it('suppresses a stale create failure but still reports a current failure', async () => {
    const pending = deferred<typeof link>();
    mockCreate.mockReturnValue(pending.promise);
    let current = true;
    confirm(() => current);
    await flush();
    current = false;
    pending.reject(new Error('Create failed'));
    await flush();
    expect(mockAlert).toHaveBeenCalledTimes(1);
    mockAlert.mockClear();
    mockCreate.mockRejectedValue(new Error('Create failed'));
    confirm(() => true);
    await flush();
    expect(mockAlert).toHaveBeenLastCalledWith('Could not create the link', 'Try again.');
  });

  it('suppresses late native-share errors without pretending to cancel dispatched sharing', async () => {
    const pending = deferred<unknown>();
    mockCreate.mockResolvedValue(link);
    mockShare.mockReturnValue(pending.promise);
    let current = true;
    confirm(() => current);
    await flush();
    expect(mockShare).toHaveBeenCalledTimes(1);
    current = false;
    pending.reject(new Error('Share closed'));
    await flush();
    expect(mockAlert).toHaveBeenCalledTimes(1);
    expect(mockRevoke).not.toHaveBeenCalled();
  });
});
