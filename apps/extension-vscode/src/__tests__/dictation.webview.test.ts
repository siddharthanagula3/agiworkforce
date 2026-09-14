/**
 * dictation.webview.test.ts, the composer microphone chip.
 *
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getWebviewContent } from '../features/sidebar-webview/webviewContent';

function makeWebview() {
  return {
    cspSource: 'vscode-webview://mock',
    asWebviewUri: (uri: { toString(): string }) => ({
      toString: () => uri.toString().replace(/^file:/, 'https://mock'),
    }),
  };
}

function makeExtensionUri() {
  return {
    toString: () => 'file:///mock/extension',
    fsPath: '/mock/extension',
  };
}

function renderWebview(): string {
  return getWebviewContent(
    makeWebview() as unknown as Parameters<typeof getWebviewContent>[0],
    makeExtensionUri() as unknown as Parameters<typeof getWebviewContent>[1],
    'test-nonce-base64url-32-chars-abcdef',
    'auto',
    'medium',
    true,
    false,
    'pro',
  );
}

function bootWebview() {
  const parsed = new DOMParser().parseFromString(renderWebview(), 'text/html');
  document.head.innerHTML = parsed.head.innerHTML;
  document.body.innerHTML = parsed.body.innerHTML;

  const postMessage = vi.fn();
  Object.defineProperty(globalThis, 'acquireVsCodeApi', {
    configurable: true,
    value: () => ({ postMessage }),
  });

  const inlineScript = Array.from(parsed.querySelectorAll('script')).find((script) =>
    script.textContent?.includes('acquireVsCodeApi()'),
  );

  // llm-guardrail-allow: executes repository-owned webview JavaScript in jsdom
  new Function(inlineScript?.textContent ?? '')();
  return { postMessage };
}

function postHostMessage(type: string, payload: Record<string, unknown>): void {
  window.dispatchEvent(new MessageEvent('message', { data: { type, payload } }));
}

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported(type: string): boolean {
    return type === 'audio/webm;codecs=opus';
  }
  state: 'inactive' | 'recording' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(
    readonly stream: unknown,
    readonly options: { mimeType: string },
  ) {
    FakeMediaRecorder.instances.push(this);
  }

  start(): void {
    this.state = 'recording';
  }

  stop(): void {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: this.options.mimeType }) });
    this.onstop?.();
  }
}

function installMicrophone(getUserMedia: () => Promise<unknown>): { stopped: number } {
  const counter = { stopped: 0 };
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: FakeMediaRecorder,
  });
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  return counter;
}

function fakeStream(counter: { stopped: number }) {
  return { getTracks: () => [{ stop: () => (counter.stopped += 1) }] };
}

async function flush(): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('composer dictation', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    FakeMediaRecorder.instances = [];
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'acquireVsCodeApi');
    Reflect.deleteProperty(globalThis, 'MediaRecorder');
    Reflect.deleteProperty(globalThis.navigator, 'mediaDevices');
    vi.restoreAllMocks();
  });

  it('sits in the composer chip row beside the mode control', () => {
    bootWebview();

    const row = document.querySelector('.composer-bottom');
    const ids = Array.from(row?.children ?? []).map((child) => child.id);
    expect(ids).toEqual([
      'plusBtn',
      'modelPill',
      'controlsSummary',
      'micBtn',
      'micStatus',
      'contextUsage',
      'followUpStatus',
      'stopBtn',
      'sendBtn',
    ]);
  });

  it('disables the chip and names the reason when the panel cannot reach a microphone', () => {
    bootWebview();

    const mic = document.getElementById('micBtn') as HTMLButtonElement;
    expect(mic.disabled).toBe(true);
    expect(mic.title).toContain('does not grant extension panels microphone access');
    expect(mic.getAttribute('aria-label')).toBe(mic.title);
  });

  it('records on the first press, sends the recording on the second, and inserts at the caret', async () => {
    const counter = { stopped: 0 };
    installMicrophone(async () => fakeStream(counter));
    const { postMessage } = bootWebview();

    const mic = document.getElementById('micBtn') as HTMLButtonElement;
    const input = document.getElementById('userInput') as HTMLTextAreaElement;
    input.value = 'please';
    input.setSelectionRange(6, 6);

    expect(mic.disabled).toBe(false);
    mic.click();
    await flush();

    expect(mic.classList.contains('recording')).toBe(true);
    expect(mic.getAttribute('aria-pressed')).toBe('true');
    expect(document.getElementById('micStatus')?.textContent).toBe('Recording…');
    expect(FakeMediaRecorder.instances[0]?.options.mimeType).toBe('audio/webm;codecs=opus');

    mic.click();
    await flush();

    expect(counter.stopped).toBe(1);
    expect(mic.classList.contains('recording')).toBe(false);
    expect(document.getElementById('micStatus')?.textContent).toBe('Transcribing…');

    const sent = postMessage.mock.calls
      .map((call) => call[0] as { type: string; payload?: { dataUrl?: string; language?: string } })
      .find((message) => message.type === 'transcribeAudio');
    expect(sent?.payload?.dataUrl?.startsWith('data:audio/webm')).toBe(true);
    expect(sent?.payload?.language).toBe('en');

    postHostMessage('dictationResult', { text: 'refactor the loader' });

    expect(input.value).toBe('please refactor the loader');
    expect(mic.classList.contains('transcribing')).toBe(false);
    expect(document.getElementById('micStatus')?.textContent).toBe('');
  });

  it('shows the host failure instead of dropping the recording silently', async () => {
    const counter = { stopped: 0 };
    installMicrophone(async () => fakeStream(counter));
    bootWebview();

    const mic = document.getElementById('micBtn') as HTMLButtonElement;
    mic.click();
    await flush();
    mic.click();
    await flush();

    postHostMessage('dictationError', { message: 'Sign in to AGI Cloud to use voice input.' });

    const status = document.getElementById('micStatus');
    expect(status?.textContent).toBe('Sign in to AGI Cloud to use voice input.');
    expect(status?.getAttribute('data-kind')).toBe('error');
    expect(mic.getAttribute('aria-pressed')).toBe('false');
  });

  it('disables the chip permanently when the host refuses the microphone', async () => {
    installMicrophone(async () => {
      const error = new Error('Permission denied');
      error.name = 'NotAllowedError';
      throw error;
    });
    bootWebview();

    const mic = document.getElementById('micBtn') as HTMLButtonElement;
    mic.click();
    await flush();

    expect(mic.disabled).toBe(true);
    expect(document.getElementById('micStatus')?.getAttribute('data-kind')).toBe('error');
  });

  it('says so when the machine has no microphone at all', async () => {
    installMicrophone(async () => {
      const error = new Error('No device');
      error.name = 'NotFoundError';
      throw error;
    });
    bootWebview();

    const mic = document.getElementById('micBtn') as HTMLButtonElement;
    mic.click();
    await flush();

    expect(mic.disabled).toBe(false);
    expect(document.getElementById('micStatus')?.textContent).toBe(
      'No microphone was found on this machine.',
    );
  });
});
