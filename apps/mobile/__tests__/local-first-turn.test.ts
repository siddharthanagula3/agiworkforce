
/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock('../storage/installedModels', () => {
  const defaultModel = (
    jest.requireActual('@agiworkforce/local-llm') as typeof import('@agiworkforce/local-llm')
  ).getDefaultModel();
  const installedDefaultModel = {
    id: defaultModel.id,
    display_name: defaultModel.displayName,
    runtime: 'local',
    format: 'pte',
    size_bytes: defaultModel.fileSizeBytes,
    sha256: null,
    local_path: null,
    installed_at: 1_700_000_000_000,
    last_used_at: null,
    capabilities: null,
  };

  return {
    listInstalledModels: jest.fn().mockResolvedValue([installedDefaultModel]),
    getInstalledModel: jest.fn().mockResolvedValue(installedDefaultModel),
    markInstalledModelUsed: jest.fn().mockResolvedValue(undefined),
    recordInstalledModel: jest.fn().mockResolvedValue(undefined),
    insertInstalledModel: jest.fn().mockResolvedValue(undefined),
  };
});

const STREAMED_TOKENS = ['The', ' answer', ' is', ' 42', '.'];
const FULL_TEXT = STREAMED_TOKENS.join('');

function makeInstance() {
  let _tokenCb: ((token: string) => void) | null = null;
  return {
    generate: jest.fn().mockImplementation(async () => {
      if (_tokenCb) {
        for (const tok of STREAMED_TOKENS) {
          _tokenCb(tok);
        }
      }
      return FULL_TEXT;
    }),
    setTokenCallback: jest
      .fn()
      .mockImplementation(({ tokenCallback }: { tokenCallback: (token: string) => void }) => {
        _tokenCb = tokenCallback;
      }),
    configure: jest.fn(),
    interrupt: jest.fn(),
    delete: jest.fn(),
  };
}

let mockInstance = makeInstance();
const mockFromModelName = jest.fn().mockImplementation(() => Promise.resolve(mockInstance));

jest.mock('@agiworkforce/local-llm', () => {
  const { getDefaultModel, getLiteModeModel, getModelById, getShippableModels, getModelsForRole } =
    jest.requireActual('@agiworkforce/local-llm') as typeof import('@agiworkforce/local-llm');

  const realTier2 = jest.requireActual(
    '@agiworkforce/local-llm',
  ) as typeof import('@agiworkforce/local-llm');

  const FIXED_CAPS = {
    totalRAMMB: 6144,
    osVersion: '18.2',
    thermalThrottled: false,
    tier1Available: false,
    tier1Runtime: null,
    tier2Available: true,
    tier3Available: true as const,
  };

  return {
    getDefaultModel,
    getLiteModeModel,
    getModelById,
    getShippableModels,
    getModelsForRole,
    tier2LoadModel: realTier2.tier2LoadModel,
    tier2Generate: realTier2.tier2Generate,
    tier2Release: realTier2.tier2Release,
    _setLLMModuleForTesting: realTier2._setLLMModuleForTesting,
    detectCapabilities: jest.fn().mockResolvedValue(FIXED_CAPS),
    isThermallyThrottled: jest.fn().mockReturnValue(false),
    getCapabilities: jest.fn().mockResolvedValue(FIXED_CAPS),
    refreshCapabilities: jest.fn().mockResolvedValue(FIXED_CAPS),
    // localGenerate: intentionally omitted so the real one is used below
  };
});

import { tier2Release, _setLLMModuleForTesting, getDefaultModel } from '@agiworkforce/local-llm';
import { resolveLocalModelRef } from '../src/features/model-picker/localModelRuntime';

const DEFAULT_LOCAL_MODEL = getDefaultModel();

describe('first offline turn: recordInstalledModel(pte) → resolveLocalModelRef', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInstance = makeInstance();
    mockFromModelName.mockImplementation(() => Promise.resolve(mockInstance));
    _setLLMModuleForTesting({ fromModelName: mockFromModelName });
    tier2Release();
  });

  afterEach(() => {
    _setLLMModuleForTesting(null);
    tier2Release();
  });

  it('resolveLocalModelRef accepts a pte-format installed model with no local_path', async () => {
    const ref = await resolveLocalModelRef(DEFAULT_LOCAL_MODEL.id);
    expect(ref.modelId).toBe(DEFAULT_LOCAL_MODEL.id);
    expect(ref.installed).toBe(true);
    expect(ref.modelPath).toBeUndefined();
  });

  it('resolveLocalModelRef does NOT throw "not downloaded yet" for a pte record', async () => {
    await expect(resolveLocalModelRef(DEFAULT_LOCAL_MODEL.id)).resolves.toBeDefined();
  });
});

describe('first offline turn: tier2Generate produces real tokens via LLMModule seam', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInstance = makeInstance();
    mockFromModelName.mockImplementation(() => Promise.resolve(mockInstance));
    _setLLMModuleForTesting({ fromModelName: mockFromModelName });
    tier2Release();
  });

  afterEach(() => {
    _setLLMModuleForTesting(null);
    tier2Release();
  });

  it('tier2Generate with the catalog preset produces real streamed tokens', async () => {
    const { getDefaultModel, tier2Generate } =
      require('@agiworkforce/local-llm') as typeof import('@agiworkforce/local-llm');
    const preset = getDefaultModel().executorchPreset!;
    const receivedTokens: string[] = [];

    const result = await tier2Generate(preset, {
      prompt: 'What is the answer to life, the universe, and everything?',
      onToken: (tok) => receivedTokens.push(tok),
    });

    expect(receivedTokens).toEqual(STREAMED_TOKENS);
    expect(result.text).toBe(FULL_TEXT);
    expect(result.runtime).toBe('executorch');
    expect(result.aborted).toBe(false);
  });

  it('LLMModule.fromModelName is called with the HuggingFace preset URLs', async () => {
    const { getDefaultModel, tier2Generate } =
      require('@agiworkforce/local-llm') as typeof import('@agiworkforce/local-llm');
    const preset = getDefaultModel().executorchPreset!;

    await tier2Generate(preset, { prompt: 'Hello' });

    expect(mockFromModelName).toHaveBeenCalledWith(
      expect.objectContaining({
        modelName: preset.modelName,
        modelSource: preset.modelSource,
        tokenizerSource: preset.tokenizerSource,
      }),
      undefined,
    );
  });

  it('generate() receives system prompt and user message in correct order', async () => {
    const { getDefaultModel, tier2Generate } =
      require('@agiworkforce/local-llm') as typeof import('@agiworkforce/local-llm');
    const preset = getDefaultModel().executorchPreset!;

    await tier2Generate(preset, {
      prompt: 'Test prompt',
      systemPrompt: 'You are helpful.',
    });

    const [messages] = mockInstance.generate.mock.calls[0] as [
      Array<{ role: string; content: string }>,
    ];
    expect(messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'Test prompt' });
  });
});
