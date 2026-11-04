import { createSharePreviewAdmission } from '../src/features/share-preview/sharePreviewAdmission';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup() {
  const dependencies = {
    isCurrent: jest.fn(() => true),
    conversationExists: jest.fn(() => true),
    createConversation: jest.fn(async (_title: string) => 'created-chat'),
    sendMessage: jest.fn(async (_id: string, _content: string, _model: string, _accepted: () => void): Promise<unknown> => false),
    navigate: jest.fn((_id: string | null) => {}),
    onChange: jest.fn(),
  };
  return { dependencies, admission: createSharePreviewAdmission(dependencies) };
}

describe('Share Preview admission', () => {
  it('locks synchronously across Send and Summarize while creation is pending', async () => {
    const { dependencies, admission } = setup();
    const create = deferred<string>();
    dependencies.createConversation.mockReturnValue(create.promise);
    const first = admission.send('title', 'shared text', 'selected-model');
    await admission.send('summary', 'summarize shared text', 'selected-model');
    expect(admission.acquire()).toBe(false);
    expect(dependencies.createConversation).toHaveBeenCalledTimes(1);
    create.resolve('created-chat');
    await first;
    expect(dependencies.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('preserves an explicitly refused send and reuses its chat on deliberate retry', async () => {
    const { dependencies, admission } = setup();
    await admission.send('title', 'shared text', 'selected-model');
    expect(dependencies.navigate).not.toHaveBeenCalled();
    expect(dependencies.onChange).toHaveBeenLastCalledWith('refused');
    await admission.send('summary', 'summarize shared text', 'another-model');
    expect(dependencies.createConversation).toHaveBeenCalledTimes(1);
    expect(dependencies.sendMessage).toHaveBeenLastCalledWith(
      'created-chat', 'summarize shared text', 'another-model', expect.any(Function),
    );
  });

  it.each(['dismissal', 'owner transition', 'mode round trip', 'payload change'])('blocks sends after %s during creation', async () => {
    const { dependencies, admission } = setup();
    const create = deferred<string>();
    dependencies.createConversation.mockReturnValue(create.promise);
    const operation = admission.send('title', 'shared text', 'selected-model');
    admission.invalidate();
    create.resolve('created-chat');
    await operation;
    await admission.send('title', 'shared text', 'selected-model');
    expect(dependencies.sendMessage).not.toHaveBeenCalled();
    expect(dependencies.navigate).not.toHaveBeenCalled();
  });

  it('checks a stale lifetime even without a subscription notification', async () => {
    const { dependencies, admission } = setup();
    dependencies.isCurrent.mockReturnValue(false);
    await admission.send('title', 'shared text', 'selected-model');
    expect(dependencies.createConversation).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 'accepted'])('treats nonboolean %s as uncertain and never retries', async (result) => {
    const { dependencies, admission } = setup();
    dependencies.sendMessage.mockResolvedValue(result);
    await admission.send('title', 'shared text', 'selected-model');
    await admission.send('title', 'shared text', 'selected-model');
    expect(dependencies.sendMessage).toHaveBeenCalledTimes(1);
    expect(dependencies.onChange).toHaveBeenLastCalledWith('uncertain');
    admission.checkChat();
    expect(dependencies.navigate).toHaveBeenCalledWith('created-chat');
  });

  it('offers the chat list after unknown creation without creating again', async () => {
    const { dependencies, admission } = setup();
    dependencies.createConversation.mockRejectedValue(new Error('response lost'));
    await admission.send('title', 'shared text', 'selected-model');
    await admission.send('title', 'shared text', 'selected-model');
    admission.checkChat();
    expect(dependencies.createConversation).toHaveBeenCalledTimes(1);
    expect(dependencies.navigate).toHaveBeenCalledWith(null);
  });

  it('does not infer safe retry from a rejected send', async () => {
    const { dependencies, admission } = setup();
    dependencies.sendMessage.mockRejectedValue(new Error('unknown outcome'));
    await admission.send('title', 'shared text', 'selected-model');
    await admission.send('title', 'shared text', 'selected-model');
    expect(dependencies.sendMessage).toHaveBeenCalledTimes(1);
    expect(dependencies.onChange).toHaveBeenLastCalledWith('uncertain');
  });

  it.each(['false', 'reject'])('keeps callback admission when the later result is %s and routing throws', async (later) => {
    const { dependencies, admission } = setup();
    dependencies.navigate.mockImplementation(() => { throw new Error('router unavailable'); });
    dependencies.sendMessage.mockImplementation(async (_id, _content, _model, accepted) => {
      expect(() => accepted()).not.toThrow();
      if (later === 'reject') throw new Error('transport failure');
      return false;
    });
    await admission.send('title', 'shared text', 'selected-model');
    await admission.send('title', 'shared text', 'selected-model');
    expect(dependencies.sendMessage).toHaveBeenCalledTimes(1);
    expect(dependencies.onChange).toHaveBeenLastCalledWith('accepted');
    dependencies.navigate.mockImplementation(() => {});
    admission.checkChat();
    expect(dependencies.navigate).toHaveBeenLastCalledWith('created-chat');
  });

  it('navigates on callback without waiting for generation completion', async () => {
    const { dependencies, admission } = setup();
    const send = deferred<unknown>();
    dependencies.sendMessage.mockImplementation((_id, _content, _model, accepted) => {
      accepted();
      return send.promise;
    });
    const operation = admission.send('title', 'shared text', 'selected-model');
    await Promise.resolve();
    expect(dependencies.navigate).toHaveBeenCalledWith('created-chat');
    send.resolve(true);
    await operation;
    expect(dependencies.navigate).toHaveBeenCalledTimes(1);
  });

  it('accepts an explicit true fallback without a callback', async () => {
    const { dependencies, admission } = setup();
    dependencies.sendMessage.mockResolvedValue(true);
    await admission.send('title', 'shared text', 'selected-model');
    expect(dependencies.navigate).toHaveBeenCalledTimes(1);
    expect(dependencies.onChange).toHaveBeenLastCalledWith('accepted');
  });

  it('never resends into a deleted retained chat or navigates after invalidation', async () => {
    const { dependencies, admission } = setup();
    await admission.send('title', 'shared text', 'selected-model');
    dependencies.conversationExists.mockReturnValue(false);
    await admission.send('title', 'shared text', 'selected-model');
    expect(dependencies.sendMessage).toHaveBeenCalledTimes(1);
    admission.checkChat();
    expect(dependencies.navigate).toHaveBeenLastCalledWith(null);
    dependencies.navigate.mockClear();
    admission.invalidate();
    admission.checkChat();
    expect(dependencies.navigate).not.toHaveBeenCalled();
  });
});
