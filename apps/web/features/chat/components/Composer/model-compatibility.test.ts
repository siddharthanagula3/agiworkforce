import { describe, it, expect } from 'vitest';
import { getProviderOfferings, getSelectableModels } from '@agiworkforce/types';
import {
  contextBudgetTokens,
  estimateConversationTokens,
  evaluateModelCompatibility,
  CONTEXT_RESERVE_TOKENS,
  MIN_CONTEXT_BUDGET_TOKENS,
  type ContextSizedMessage,
} from './model-compatibility';

const models = getSelectableModels().filter((meta) => (meta.contextWindow ?? 0) > 0);

const anyModel = models[0]!;
const blindModel = models.find((meta) => !meta.capabilities.vision);
const toollessModel = models.find((meta) => !meta.capabilities.tools);

function request(overrides: Partial<Parameters<typeof evaluateModelCompatibility>[1]> = {}) {
  return {
    messages: [] as ContextSizedMessage[],
    hasImages: false,
    needsTools: false,
    ...overrides,
  };
}

describe('contextBudgetTokens', () => {
  it('reserves the reply and the fixed headroom out of the window', () => {
    expect(contextBudgetTokens(100_000, 8_000)).toBe(100_000 - 8_000 - CONTEXT_RESERVE_TOKENS);
  });

  it('never returns less than the floor, however small the window', () => {
    expect(contextBudgetTokens(1_000, 900)).toBe(MIN_CONTEXT_BUDGET_TOKENS);
  });

  it('ignores a negative reply allowance rather than crediting it', () => {
    expect(contextBudgetTokens(50_000, -10_000)).toBe(50_000 - CONTEXT_RESERVE_TOKENS);
  });
});

describe('estimateConversationTokens', () => {
  it('charges every image part, not only the text', () => {
    const withoutImage = estimateConversationTokens(
      [{ role: 'user', content: 'hello' }],
      anyModel.id,
    );
    const withImage = estimateConversationTokens(
      [{ role: 'user', content: 'hello', multimodal_content: [{}, {}] }],
      anyModel.id,
    );
    expect(withImage).toBeGreaterThan(withoutImage);
  });
});

describe('evaluateModelCompatibility', () => {
  it('describes promotional route limits without naming the wrong provider', () => {
    const experiential = Object.entries(getProviderOfferings()).find(
      ([, offering]) => offering.provider === 'experientiallabs' && offering.category === 'chat',
    );
    expect(experiential).toBeDefined();

    const result = evaluateModelCompatibility(
      experiential![0],
      request({ hasImages: true, historicalAttachments: true, needsTools: true }),
    );
    expect(result.findings).toEqual([
      {
        code: 'no_vision',
        message:
          'Earlier attachments will not be sent to this promotional free model. Use Free Auto if your next answer depends on them.',
      },
      { code: 'no_tools', message: 'Turn off tools to use this free model.' },
    ]);
  });

  it('warns about any staged file before switching to a text-only free promotion', () => {
    const promotional = Object.entries(getProviderOfferings()).find(
      ([, offering]) => offering.quotaProbeProtocol === 'chat' && !offering.quotaChatImageInput,
    );
    expect(promotional).toBeDefined();
    const result = evaluateModelCompatibility(promotional![0], request({ hasAttachments: true }));
    expect(result.findings).toEqual([
      {
        code: 'no_attachments',
        message: 'This free model accepts text only. Remove attached files or use Free Auto.',
      },
    ]);
  });

  it('accepts images but rejects other files for a vision-capable free promotion', () => {
    const promotional = Object.entries(getProviderOfferings()).find(
      ([, offering]) => offering.quotaProbeProtocol === 'chat' && offering.quotaChatImageInput,
    );
    expect(promotional).toBeDefined();
    expect(
      evaluateModelCompatibility(
        promotional![0],
        request({ hasImages: true, hasAttachments: true }),
      ).findings,
    ).toEqual([]);
    expect(
      evaluateModelCompatibility(
        promotional![0],
        request({ hasImages: true, hasAttachments: true, hasNonImageAttachments: true }),
      ).findings,
    ).toEqual([
      {
        code: 'no_attachments',
        message: 'This free model accepts images only. Remove other files or use Free Auto.',
      },
    ]);
  });

  it('finds nothing wrong with a short conversation on a live model', () => {
    const result = evaluateModelCompatibility(
      anyModel.id,
      request({ messages: [{ role: 'user', content: 'hi' }] }),
    );
    expect(result.findings).toEqual([]);
    expect(result.modelName).toBe(anyModel.name);
  });

  it('reports the overflow when the history cannot fit the window', () => {
    const budget = contextBudgetTokens(anyModel.contextWindow!, anyModel.maxOutputTokens ?? 0);
    const result = evaluateModelCompatibility(
      anyModel.id,
      request({ messages: [{ role: 'user', content: 'x'.repeat(budget * 6) }] }),
    );
    expect(result.findings.map((finding) => finding.code)).toContain('context_overflow');
    expect(result.estimatedTokens).toBeGreaterThan(result.budgetTokens!);
  });

  it('reports a model that cannot read the images the turn carries', () => {
    if (!blindModel) return;
    const result = evaluateModelCompatibility(blindModel.id, request({ hasImages: true }));
    expect(result.findings.map((finding) => finding.code)).toContain('no_vision');
  });

  it('stays silent about vision when the turn carries no images', () => {
    if (!blindModel) return;
    const result = evaluateModelCompatibility(blindModel.id, request({ hasImages: false }));
    expect(result.findings.map((finding) => finding.code)).not.toContain('no_vision');
  });

  it('names the armed controls when the model cannot call tools', () => {
    if (!toollessModel) return;
    const result = evaluateModelCompatibility(
      toollessModel.id,
      request({ needsTools: true, toolLabel: 'web search' }),
    );
    const finding = result.findings.find((entry) => entry.code === 'no_tools');
    expect(finding?.message).toContain('web search');
  });

  it('says so when the id is not in the catalogue instead of guessing limits', () => {
    const result = evaluateModelCompatibility('not-a-catalogued-id', request());
    expect(result.findings.map((finding) => finding.code)).toEqual(['unknown_model']);
    expect(result.budgetTokens).toBeNull();
  });

  it('claims nothing when no model is selected yet', () => {
    expect(evaluateModelCompatibility(null, request()).findings).toEqual([]);
  });
});
