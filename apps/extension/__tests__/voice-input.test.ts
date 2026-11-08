// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import catalog from '../_locales/en/messages.json';
import { buildMicrophoneNotice, setupVoiceInput } from '../src/features/side-panel/voice';

type Result = { results: Array<Array<{ transcript: string }>> };
let instances: Recognition[];
let failStart: boolean;
const query = vi.fn();

class Recognition {
  lang = '';
  interimResults = false;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onresult: ((event: Result) => void) | null = null;
  start = vi.fn(() => {
    if (failStart) throw new DOMException('Recognition unavailable', 'InvalidStateError');
  });
  stop = vi.fn();
  abort = vi.fn();
  constructor() {
    instances.push(this);
  }
}

beforeEach(() => {
  document.body.replaceChildren();
  instances = [];
  failStart = false;
  query.mockReset().mockResolvedValue({ state: 'granted' });
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query } });
  vi.stubGlobal('SpeechRecognition', Recognition);
  vi.stubGlobal('chrome', {
    storage: {
      local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
      sync: { get: vi.fn(async () => ({})) },
      onChanged: { addListener: vi.fn() },
    },
    i18n: {
      getMessage: (key: string) =>
        (catalog as Record<string, { message: string }>)[key]?.message ?? '',
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const mic = document.createElement('button');
  const input = document.createElement('textarea');
  const notice = buildMicrophoneNotice();
  document.body.append(mic, input, notice.element);
  const resize = vi.fn();
  const error = vi.fn();
  const api = setupVoiceInput(mic, input, resize, error, notice);
  return { mic, input, notice, resize, error, api };
}

async function start(mic: HTMLButtonElement) {
  mic.click();
  await vi.waitFor(() => expect(instances).toHaveLength(1));
  return instances[0]!;
}

describe('voice input lifetime', () => {
  it.each([false, true])(
    'reports a no-text end unless the user stopped (stopped=%s)',
    async (stopped) => {
      const { mic, input, error } = setup();
      input.value = 'Keep this draft';
      const current = await start(mic);
      current.onstart!();
      if (stopped) mic.click();
      current.onend!();
      expect(error).toHaveBeenCalledTimes(stopped ? 0 : 1);
      expect(input.value).toBe('Keep this draft');
      expect(mic.classList.contains('active')).toBe(false);
    },
  );

  it('appends a current transcript and preserves the typed draft', async () => {
    const { mic, input, resize } = setup();
    input.value = 'Typed draft';
    const current = await start(mic);
    current.onstart!();
    current.onresult!({ results: [[{ transcript: 'spoken addition' }]] });
    expect(input.value).toBe('Typed draft spoken addition');
    expect(resize).toHaveBeenCalledWith(input);
    expect(mic.getAttribute('aria-pressed')).toBe('true');
    current.onend!();
    expect(mic.getAttribute('aria-pressed')).toBe('false');
  });

  it('aborts a reset session and ignores its captured late callbacks', async () => {
    const { mic, input, api, error } = setup();
    const current = await start(mic);
    current.onstart!();
    const result = current.onresult!;
    const lateError = current.onerror!;
    api.reset();
    input.value = 'New chat draft';
    result({ results: [[{ transcript: 'retired speech' }]] });
    lateError({ error: 'network' });
    expect(current.abort).toHaveBeenCalledOnce();
    expect(current.onresult).toBeNull();
    expect(input.value).toBe('New chat draft');
    expect(error).not.toHaveBeenCalled();
    expect(mic.classList.contains('active')).toBe(false);
  });

  it('does not start after a permission response arrives for a reset chat', async () => {
    let finish!: (status: { state: string }) => void;
    query.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const { mic, api } = setup();
    mic.click();
    await vi.waitFor(() => expect(finish).toBeDefined());
    api.reset();
    finish({ state: 'granted' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(instances).toHaveLength(0);
  });

  it('clears a pending notice and makes its old Continue inert', async () => {
    query.mockResolvedValue({ state: 'prompt' });
    const { mic, notice, api } = setup();
    mic.click();
    await vi.waitFor(() => expect(notice.element.classList.contains('visible')).toBe(true));
    const button = [...notice.element.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent === catalog.spVoiceNoticeContinue.message,
    )!;
    api.reset();
    button.click();
    expect(notice.element.classList.contains('visible')).toBe(false);
    expect(instances).toHaveLength(0);
  });

  it('permits retry after controls were disabled during the permission check', async () => {
    let finish!: (status: { state: string }) => void;
    query.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const { mic } = setup();
    mic.click();
    await vi.waitFor(() => expect(finish).toBeDefined());
    mic.disabled = true;
    finish({ state: 'granted' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(instances).toHaveLength(0);
    mic.disabled = false;
    await start(mic);
  });

  it('treats a second click before onstart as Stop instead of a second recognition', async () => {
    const { mic } = setup();
    const current = await start(mic);
    mic.click();
    expect(instances).toHaveLength(1);
    expect(current.stop).toHaveBeenCalledOnce();
  });

  it('reports a synchronous start failure and permits a later attempt', async () => {
    failStart = true;
    const { mic, error } = setup();
    await start(mic);
    expect(error).toHaveBeenCalledWith(catalog.spVoiceErrorGeneric.message);
    expect(mic.classList.contains('active')).toBe(false);
    failStart = false;
    mic.click();
    await vi.waitFor(() => expect(instances).toHaveLength(2));
    expect(instances[1]!.start).toHaveBeenCalledOnce();
  });
});
