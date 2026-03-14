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

  it('maps waitForSelector timeout to the live timeout parameter', async () => {
    await BrowserAutomation.waitForSelector('tab-1', '#submit', 4500);

    expect(invokeMock).toHaveBeenCalledWith('browser_wait_for_selector', {
      tabId: 'tab-1',
      selector: '#submit',
      timeout: 4500,
    });
  });

  it('sends browser_screenshot with selector instead of a dead fullPage flag', async () => {
    await BrowserAutomation.screenshot('tab-1', '#content');

    expect(invokeMock).toHaveBeenCalledWith('browser_screenshot', {
      tabId: 'tab-1',
      selector: '#content',
    });
  });

  it('sends browser_execute_async_js without dead retry/timeout payload', async () => {
    await BrowserAutomation.executeAsyncJs('tab-1', 'return 1');

    expect(invokeMock).toHaveBeenCalledWith('browser_execute_async_js', {
      tabId: 'tab-1',
      script: 'return 1',
    });
  });

  it('maps fillForm to selector + data', async () => {
    await BrowserAutomation.fillForm('tab-1', 'form#apply', {
      email: 'test@example.com',
      subscribed: true,
    });

    expect(invokeMock).toHaveBeenCalledWith('browser_fill_form', {
      tabId: 'tab-1',
      selector: 'form#apply',
      data: {
        email: 'test@example.com',
        subscribed: true,
      },
    });
  });

  it('maps dragAndDrop to source/target payload keys', async () => {
    await BrowserAutomation.dragAndDrop('tab-1', '#source', '#target');

    expect(invokeMock).toHaveBeenCalledWith('browser_drag_and_drop', {
      tabId: 'tab-1',
      source: '#source',
      target: '#target',
    });
  });

  it('maps uploadFile to paths[]', async () => {
    await BrowserAutomation.uploadFile('tab-1', 'input[type=file]', '/tmp/file.txt');

    expect(invokeMock).toHaveBeenCalledWith('browser_upload_file', {
      tabId: 'tab-1',
      selector: 'input[type=file]',
      paths: ['/tmp/file.txt'],
    });
  });

  it('calls browser_get_frames with tab context', async () => {
    await BrowserAutomation.getFrames('tab-1');

    expect(invokeMock).toHaveBeenCalledWith('browser_get_frames', {
      tabId: 'tab-1',
    });
  });

  it('calls browser_execute_in_frame with frame context', async () => {
    await BrowserAutomation.executeInFrame('tab-1', 'frame-1', 'return 1');

    expect(invokeMock).toHaveBeenCalledWith('browser_execute_in_frame', {
      tabId: 'tab-1',
      frameId: 'frame-1',
      script: 'return 1',
    });
  });

  it('calls browser_call_function with function args', async () => {
    await BrowserAutomation.callFunction('tab-1', 'doThing', ['alpha', 1]);

    expect(invokeMock).toHaveBeenCalledWith('browser_call_function', {
      tabId: 'tab-1',
      functionName: 'doThing',
      args: ['alpha', 1],
    });
  });
});
