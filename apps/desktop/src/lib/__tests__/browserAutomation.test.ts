import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserAutomation } from '../browserAutomation';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

describe('BrowserAutomation', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it('calls browser_init without expecting a string payload', async () => {
    await BrowserAutomation.init();

    expect(invokeMock).toHaveBeenCalledWith('browser_init');
  });

  it('launches with the browser type and headless flag only', async () => {
    await BrowserAutomation.launch('chromium', true);

    expect(invokeMock).toHaveBeenCalledWith('browser_launch', {
      browserType: 'chromium',
      headless: true,
    });
  });

  it('refuses to navigate to anything but an http or https page', async () => {
    await expect(BrowserAutomation.navigate('tab-1', 'file:///etc/passwd')).rejects.toThrow(
      'Only HTTP(S) URLs are allowed',
    );
    await expect(BrowserAutomation.navigate('tab-1', '  ')).rejects.toThrow('URL cannot be empty');
    expect(invokeMock).not.toHaveBeenCalled();

    await BrowserAutomation.navigate('tab-1', 'https://example.com/');
    expect(invokeMock).toHaveBeenCalledWith('browser_navigate', {
      tabId: 'tab-1',
      url: 'https://example.com/',
    });
  });

  it('reads the live frame of one tab', async () => {
    await BrowserAutomation.getScreenshotStream('tab-1');

    expect(invokeMock).toHaveBeenCalledWith('browser_get_screenshot_stream', { tabId: 'tab-1' });
  });
});
