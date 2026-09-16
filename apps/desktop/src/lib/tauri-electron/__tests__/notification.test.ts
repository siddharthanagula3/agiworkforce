import { afterEach, describe, expect, it, vi } from 'vitest';
import { desktopDeepLink, type ElectronHostBridge } from '../bridgeContract';
import { sendNotification } from '../notification';

function installHost(notify: ReturnType<typeof vi.fn>): void {
  Object.defineProperty(window, 'agiHost', {
    value: { notify } as unknown as ElectronHostBridge,
    configurable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(window, 'agiHost');
});

describe('sendNotification', () => {
  it('forwards the caller deep link to the host', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    installHost(notify);

    await sendNotification({
      title: 'Task complete',
      body: 'Weekly report',
      deepLink: desktopDeepLink('chat', 'conversation-1'),
    });

    expect(notify).toHaveBeenCalledWith({
      title: 'Task complete',
      body: 'Weekly report',
      deepLink: 'agiworkforce-cloud://chat/conversation-1',
    });
  });

  it('omits the field entirely when the caller has no link', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    installHost(notify);

    await sendNotification({ title: 'Task complete', body: 'Weekly report' });

    expect(Object.keys(notify.mock.calls[0]![0] as object)).toEqual(['title', 'body']);
  });

  it('keeps the bare-string form working', async () => {
    const notify = vi.fn().mockResolvedValue(undefined);
    installHost(notify);

    await sendNotification('Task complete');

    expect(Object.keys(notify.mock.calls[0]![0] as object)).toEqual(['title']);
  });

  it('is inert with no shell, so the Tauri build notifies nothing', async () => {
    await expect(sendNotification({ title: 'Task complete' })).resolves.toBeUndefined();
  });
});
