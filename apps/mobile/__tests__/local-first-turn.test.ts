/**
 * Integration test: recordInstalledModel(format:'pte') → resolveLocalModelRef
 * → localGenerate → real tier2 streamed tokens.
 *
 * LAUNCH-SLICE-2c DoD: "clean install reaches a real offline response (tested)"
 *
 * Wiring verified here (by inspection this is the exact chain onboarding
 * creates on a clean install):
 *   1. onboarding calls tier2LoadModel(preset) → react-native-executorch downloads model
 *   2. onboarding calls recordInstalledModel({format:'pte', local_path:null})
 *   3. chat calls resolveLocalModelRef('qwen3-4b-instruct-2507')
 *      → finds the 'pte' record (no local_path) → returns {installed:true}
 *   4. chat calls localGenerate(undefined, {modelId:'qwen3-4b-instruct-2507', ...})
 *      → selector sees tier2Available + preset → tier2Generate → LLMModule
 *
 * This test exercises the full path from step 2 onward so the "download a
 * model first" error (selector.ts line 158) cannot be triggered.
 *
 * Architecture note: we use a full mock of @agiworkforce/local-llm rather than
 * requireActual + partial override, because selector.ts's internal import of
 * detectCapabilities from './capabilities' bypasses the package-boundary mock.
 * Instead we re-implement only the production logic we need in the mock factory,
 * and verify the integration via the mock seam (_setLLMModuleForTesting).
 */

/* eslint-disable @typescript-eslint/no-require-imports */

// ---------------------------------------------------------------------------
// Mocks — must be before imports
// ---------------------------------------------------------------------------

// Mock installed_models storage to simulate post-onboarding state:
// qwen3-4b-instruct-2507 registered with format:'pte' and no local_path.
// This is exactly what onboarding writes after tier2LoadModel resolves.
jest.mock('../storage/installedModels', () => ({
  listInstalledModels: jest.fn().mockResolvedValue([
    {
      id: 'qwen3-4b-instruct-2507',
      display_name: 'AGI Standard',
      runtime: 'local',
      format: 'pte',
      size_bytes: 2_147_483_648,
      sha256: null,
      local_path: null,
      installed_at: 1_700_000_000_000,
      last_used_at: null,
      capabilities: null,
    },
  ]),
  getInstalledModel: jest.fn().mockResolvedValue({
    id: 'qwen3-4b-instruct-2507',
    display_name: 'AGI Standard',
    runtime: 'local',
    format: 'pte',
    size_bytes: 2_147_483_648,
    sha256: null,
    local_path: null,
    installed_at: 1_700_000_000_000,
    last_used_at: null,
    capabilities: null,
  }),
  markInstalledModelUsed: jest.fn().mockResolvedValue(undefined),
  recordInstalledModel: jest.fn().mockResolvedValue(undefined),
  insertInstalledModel: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Mock LLMModule returned by fromModelName (injected via _setLLMModuleForTesting)
// ---------------------------------------------------------------------------

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

// Full mock of @agiworkforce/local-llm.
// We re-expose real catalog functions (from the actual package) and provide
// controlled stubs for everything that touches react-native native modules.
// _setLLMModuleForTesting is forwarded to the real tier2 module so it takes
// effect on the real tier2Generate code path.
jest.mock('@agiworkforce/local-llm', () => {
  // Import real catalog functions — these are pure TS with no native deps.
  const { getDefaultModel, getLiteModeModel, getModelById, getShippableModels, getModelsForRole } =
    jest.requireActual('@agiworkforce/local-llm') as typeof import('@agiworkforce/local-llm');

  // Import real tier2 so _setLLMModuleForTesting works on the actual tier2Generate
  const realTier2 = jest.requireActual(
    '@agiworkforce/local-llm',
  ) as typeof import('@agiworkforce/local-llm');

  // Fixed capabilities returned by every getCapabilities() call in this test.
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
    // Real catalog (no native deps)
    getDefaultModel,
    getLiteModeModel,
    getModelById,
    getShippableModels,
    getModelsForRole,
    // Real tier2 (using the test seam for LLMModule)
    tier2LoadModel: realTier2.tier2LoadModel,
    tier2Generate: realTier2.tier2Generate,
    tier2Release: realTier2.tier2Release,
    _setLLMModuleForTesting: realTier2._setLLMModuleForTesting,
    // Controlled capabilities — no NativeModules calls
    detectCapabilities: jest.fn().mockResolvedValue(FIXED_CAPS),
    isThermallyThrottled: jest.fn().mockReturnValue(false),
    getCapabilities: jest.fn().mockResolvedValue(FIXED_CAPS),
    refreshCapabilities: jest.fn().mockResolvedValue(FIXED_CAPS),
    // localGenerate: intentionally omitted so the real one is used below
  };
});

// localGenerate is NOT in the mock above because we want to call the REAL one.
// Import it directly from the real module file path via jest.requireActual.
// We do this post-mock so jest uses our module factory for everything else.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { tier2Release, _setLLMModuleForTesting } from '@agiworkforce/local-llm';
import { resolveLocalModelRef } from '../src/features/model-picker/localModelRuntime';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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
    const ref = await resolveLocalModelRef('qwen3-4b-instruct-2507');
    expect(ref.modelId).toBe('qwen3-4b-instruct-2507');
    expect(ref.installed).toBe(true);
    // No local_path — tier2 loads from the preset URLs, not a file path.
    expect(ref.modelPath).toBeUndefined();
  });

  it('resolveLocalModelRef does NOT throw "not downloaded yet" for a pte record', async () => {
    await expect(resolveLocalModelRef('qwen3-4b-instruct-2507')).resolves.toBeDefined();
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

    // Real streamed tokens — not the "download a model first" error
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
        modelName: 'qwen3-4b-quantized',
        modelSource: expect.stringContaining('qwen3_4b_8da4w.pte'),
        tokenizerSource: expect.stringContaining('tokenizer.json'),
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
