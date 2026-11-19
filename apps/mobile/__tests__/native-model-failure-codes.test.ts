import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  APPLE_INTELLIGENCE_FAILURE_SCOPES,
  isSystemModelUnusableError,
} from '@/src/features/model-picker/systemModelAvailability';

const swift = readFileSync(
  resolve(__dirname, '..', 'native/ios/AGIFoundationModels.swift'),
  'utf8',
);
const store = readFileSync(resolve(__dirname, '..', 'stores/chat/chatExecutionStore.ts'), 'utf8');

function switchAfter(marker: string): string {
  const start = swift.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  return swift.slice(start, swift.indexOf('default:', start));
}

function codesByCase(switchSource: string): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const [, patterns, code] of switchSource.matchAll(/case ([^:\n]+):\s*return "([A-Z_]+)"/g)) {
    for (const pattern of patterns!.split(',')) {
      mapping[pattern.trim().replace(/^\./, '')] = code!;
    }
  }
  return mapping;
}

describe('the Apple Intelligence failure codes', () => {
  it('are exactly the codes the native module rejects with', () => {
    const nativeCodes = new Set(
      Array.from(swift.matchAll(/"(APPLE_INTELLIGENCE_[A-Z_]+)"/g), ([, code]) => code),
    );

    expect([...nativeCodes].sort()).toEqual(Object.keys(APPLE_INTELLIGENCE_FAILURE_SCOPES).sort());
  });

  it('give each iOS 26 generation failure its own code', () => {
    expect(codesByCase(switchAfter('as? LanguageModelSession.GenerationError'))).toEqual({
      exceededContextWindowSize: 'APPLE_INTELLIGENCE_CONTEXT_EXCEEDED',
      assetsUnavailable: 'APPLE_INTELLIGENCE_ASSETS_UNAVAILABLE',
      rateLimited: 'APPLE_INTELLIGENCE_RATE_LIMITED',
      concurrentRequests: 'APPLE_INTELLIGENCE_RATE_LIMITED',
      guardrailViolation: 'APPLE_INTELLIGENCE_REFUSED',
      refusal: 'APPLE_INTELLIGENCE_REFUSED',
      unsupportedLanguageOrLocale: 'APPLE_INTELLIGENCE_UNSUPPORTED_LANGUAGE',
    });
  });

  it('give each iOS 27 language model failure its own code', () => {
    expect(codesByCase(switchAfter('as? LanguageModelError'))).toEqual({
      contextSizeExceeded: 'APPLE_INTELLIGENCE_CONTEXT_EXCEEDED',
      rateLimited: 'APPLE_INTELLIGENCE_RATE_LIMITED',
      timeout: 'APPLE_INTELLIGENCE_RATE_LIMITED',
      guardrailViolation: 'APPLE_INTELLIGENCE_REFUSED',
      refusal: 'APPLE_INTELLIGENCE_REFUSED',
      unsupportedLanguageOrLocale: 'APPLE_INTELLIGENCE_UNSUPPORTED_LANGUAGE',
    });
    expect(swift).toMatch(
      /sessionError == \.concurrentRequests \{\s*return "APPLE_INTELLIGENCE_RATE_LIMITED"/,
    );
    expect(swift).toMatch(
      /error is SystemLanguageModel\.Error \{\s*return "APPLE_INTELLIGENCE_ASSETS_UNAVAILABLE"/,
    );
  });

  it.each(Object.entries(APPLE_INTELLIGENCE_FAILURE_SCOPES))(
    'reads %s as a failure of the %s',
    (code, scope) => {
      expect(isSystemModelUnusableError(new Error(code))).toBe(scope === 'model');
    },
  );

  it('never reads a refusal, a busy model, an unsupported language or a long conversation as an unusable model', () => {
    expect(APPLE_INTELLIGENCE_FAILURE_SCOPES).toMatchObject({
      APPLE_INTELLIGENCE_REFUSED: 'request',
      APPLE_INTELLIGENCE_RATE_LIMITED: 'request',
      APPLE_INTELLIGENCE_UNSUPPORTED_LANGUAGE: 'request',
      APPLE_INTELLIGENCE_CONTEXT_EXCEEDED: 'request',
    });
  });

  it.each(Object.keys(APPLE_INTELLIGENCE_FAILURE_SCOPES))(
    'give %s its own message in the chat',
    (code) => {
      expect(store).toContain(`raw.includes('${code}')`);
    },
  );
});
