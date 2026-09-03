import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function appRoot(): string {
  const direct = process.cwd();
  if (existsSync(join(direct, 'db/neon'))) return direct;
  const nested = join(direct, 'apps/web');
  if (existsSync(join(nested, 'db/neon'))) return nested;
  throw new Error(`Could not locate apps/web from ${direct}`);
}

const APP_ROOT = appRoot();

const ROOT = APP_ROOT;

const MODEL_SERVING_ROUTES = [
  'app/api/llm/v1/chat/completions/route.ts',
  'app/api/llm/v1/embeddings/route.ts',
  'app/api/llm/v1/audio/transcriptions/route.ts',
  'app/api/media/image/generate/route.ts',
  'app/api/media/video/generate/route.ts',
] as const;

/**
 * Chat completions asks through the request processor, which is where the model
 * is finally resolved. Naming the indirection here keeps the guard honest
 * rather than letting the route pass on an import it does not use.
 */
const GATE_CALLERS: Record<string, string> = {
  'app/api/llm/v1/chat/completions/route.ts':
    'app/api/llm/v1/chat/completions/lib/request-processor.ts',
};

function source(relative: string): string {
  const full = join(ROOT, relative);
  expect(existsSync(full), `${relative} does not exist`).toBe(true);
  return readFileSync(full, 'utf8');
}

describe('workspace model policy covers every model-serving route', () => {
  for (const route of MODEL_SERVING_ROUTES) {
    it(`${route} asks the model policy before calling a provider`, () => {
      const file = GATE_CALLERS[route] ?? route;
      const text = source(file);

      expect(
        /buildModelPolicyGateResponse|evaluateModelAccessFor(Request|Organization)/.test(text),
        `${file} never asks the model policy, so a blocked model reaches the provider through it`,
      ).toBe(true);
    });
  }

  it('checks chat completions AFTER auto-routing resolves, not before', () => {
    const text = source('app/api/llm/v1/chat/completions/lib/request-processor.ts');
    const resolution = text.indexOf('chatRequest.model = routeDecision.modelKey');
    const gate = text.indexOf('evaluateModelAccessForOrganization(');

    expect(resolution).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(-1);
    expect(gate, 'the model check must run after the model is resolved').toBeGreaterThan(
      resolution,
    );
  });

  it('passes a catalog model id, never the provider-facing id', () => {
    // Policies are written against catalog ids. Handing the provider-facing
    // `apiModelId` to the evaluator would silently match nothing.
    const text = source('app/api/llm/v1/audio/transcriptions/route.ts');
    const call = text.slice(
      text.indexOf('buildModelPolicyGateResponse('),
      text.indexOf('buildModelPolicyGateResponse(') + 320,
    );

    expect(call).toContain('selectedModel.id');
    expect(call).not.toMatch(/modelId:\s*model\b/);
  });

  it('every gate call sends a provider and a model, not a placeholder', () => {
    for (const route of MODEL_SERVING_ROUTES) {
      const file = GATE_CALLERS[route] ?? route;
      const text = source(file);
      const index = ['ModelPolicyGateResponse(', 'evaluateModelAccessForOrganization(']
        .map((needle) => text.indexOf(needle))
        .find((at) => at >= 0);

      expect(index, `${file} has no model-policy call to inspect`).toBeDefined();
      const call = text.slice(index as number, (index as number) + 400);

      expect(call, `${file} must send a provider`).toMatch(/provider:/);
      expect(call, `${file} must send a model id`).toMatch(/modelId:/);
      // The admission gates upstream legitimately use descriptors like
      // 'image-generation'; the model gate must not.
      expect(call).not.toMatch(/modelId:\s*'(image|video|audio|chat)-/);
    }
  });
});
