import { NativeModules } from 'react-native';
import { localGenerate } from '@agiworkforce/local-llm';
import { translate } from '../services/translateService';
import { resolveLocalModelRef } from '../src/features/model-picker/localModelRuntime';
import type { LocalModelRef } from '../src/features/model-picker/localModelRuntime';

jest.mock('../src/features/model-picker/localModelRuntime', () => ({
  resolveLocalModelRef: jest.fn(),
}));

jest.mock('@agiworkforce/local-llm', () => ({
  getDefaultModel: () => ({ id: 'fixture-model', displayName: 'Fixture' }),
  localGenerate: jest.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const generate = jest.mocked(localGenerate);
const resolveModel = jest.mocked(resolveLocalModelRef);
beforeEach(() => {
  resolveModel.mockReset();
  resolveModel.mockResolvedValue({
    modelId: 'fixture-model',
    displayName: 'Fixture',
    installed: true,
  });
});
const originalNative = NativeModules.AGITranslate;
afterEach(() => {
  NativeModules.AGITranslate = originalNative;
  jest.clearAllMocks();
});

test('pre-aborted requests do not probe native or generate', async () => {
  const probe = jest.fn();
  NativeModules.AGITranslate = { isPairDownloaded: probe };
  const controller = new AbortController();
  controller.abort();
  await expect(translate('text', 'en', 'hi', { signal: controller.signal })).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(probe).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
});

test('abort during native probe prevents native translation and fallback', async () => {
  const probe = deferred<boolean>();
  const nativeTranslate = jest.fn();
  NativeModules.AGITranslate = {
    isPairDownloaded: () => probe.promise,
    translate: nativeTranslate,
  };
  const controller = new AbortController();
  const pending = translate('text', 'en', 'hi', { signal: controller.signal });
  controller.abort();
  probe.resolve(true);
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(nativeTranslate).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
});

test.each(['resolve', 'reject'] as const)(
  'native %s after abort cannot publish or fall back',
  async (outcome) => {
    const native = deferred<{ translatedText: string }>();
    const nativeTranslate = jest.fn(() => native.promise);
    NativeModules.AGITranslate = { isPairDownloaded: async () => true, translate: nativeTranslate };
    const controller = new AbortController();
    const pending = translate('text', 'en', 'hi', { signal: controller.signal });
    await Promise.resolve();
    await Promise.resolve();
    expect(nativeTranslate).toHaveBeenCalledTimes(1);
    controller.abort();
    if (outcome === 'resolve') native.resolve({ translatedText: 'old' });
    else native.reject(new Error('native failed'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(generate).not.toHaveBeenCalled();
  },
);

test('fallback forwards signal and never returns partial aborted output', async () => {
  NativeModules.AGITranslate = undefined;
  const controller = new AbortController();
  const token = jest.fn();
  generate.mockImplementationOnce(async (_model, options) => {
    expect(options.signal).toBe(controller.signal);
    options.onToken?.('partial');
    controller.abort();
    options.onToken?.('late');
    return { text: '', runtime: 'executorch', aborted: true };
  });
  await expect(
    translate('text', 'en', 'hi', { signal: controller.signal, onToken: token }),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(token.mock.calls).toEqual([['partial']]);
});

test('runtime cancellation without an aborted signal still rejects partial output', async () => {
  NativeModules.AGITranslate = undefined;
  generate.mockImplementationOnce(async (_model, options) => {
    options.onToken?.('partial');
    return { text: '', runtime: 'executorch', aborted: true };
  });
  await expect(translate('text', 'en', 'hi')).rejects.toMatchObject({ name: 'AbortError' });
});

test('ordinary native failure still permits local translation without account context', async () => {
  NativeModules.AGITranslate = {
    isPairDownloaded: async () => false,
    translate: async () => {
      throw new Error('unavailable');
    },
  };
  generate.mockResolvedValueOnce({ text: 'translated', runtime: 'executorch', aborted: false });
  await expect(translate('text', 'en', 'hi')).resolves.toMatchObject({
    translatedText: 'translated',
    backend: 'local_llm',
  });
});

test('native success bypasses local model admission entirely', async () => {
  NativeModules.AGITranslate = {
    isPairDownloaded: async () => true,
    translate: async () => ({ translatedText: 'native result' }),
  };
  await expect(translate('text', 'en', 'hi')).resolves.toMatchObject({
    translatedText: 'native result',
  });
  expect(resolveModel).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
});

test('missing default installation rejects without generation or selecting another model', async () => {
  NativeModules.AGITranslate = undefined;
  resolveModel.mockRejectedValueOnce(new Error('default not downloaded'));
  await expect(translate('text', 'en', 'hi')).rejects.toThrow('default not downloaded');
  expect(resolveModel.mock.calls).toEqual([['fixture-model']]);
  expect(generate).not.toHaveBeenCalled();
});

test.each([undefined, '/fixture/installed-default.gguf'])(
  'forwards exact admitted default ID and path %s',
  async (modelPath) => {
    NativeModules.AGITranslate = undefined;
    resolveModel.mockResolvedValueOnce({
      modelId: 'fixture-model',
      modelPath,
      displayName: 'Fixture',
      installed: true,
    });
    generate.mockResolvedValueOnce({ text: 'translated', runtime: 'executorch', aborted: false });
    await expect(translate('text', 'en', 'hi')).resolves.toMatchObject({
      translatedText: 'translated',
    });
    expect(resolveModel).toHaveBeenCalledWith('fixture-model');
    expect(generate).toHaveBeenCalledWith(
      modelPath,
      expect.objectContaining({ modelId: 'fixture-model' }),
    );
  },
);

test.each(['resolve', 'reject'] as const)(
  'model admission %s after abort reports cancellation without generation',
  async (outcome) => {
    NativeModules.AGITranslate = undefined;
    const admission = deferred<LocalModelRef>();
    resolveModel.mockReturnValueOnce(admission.promise);
    const controller = new AbortController();
    const pending = translate('text', 'en', 'hi', { signal: controller.signal });
    await Promise.resolve();
    expect(resolveModel).toHaveBeenCalledWith('fixture-model');
    controller.abort();
    if (outcome === 'resolve') {
      admission.resolve({ modelId: 'fixture-model', installed: true, displayName: 'Fixture' });
    } else {
      admission.reject(new Error('admission unavailable'));
    }
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(generate).not.toHaveBeenCalled();
  },
);
