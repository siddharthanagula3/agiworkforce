import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mobileRoot = resolve(__dirname, '..');

function readMobileFile(path: string): string {
  return readFileSync(resolve(mobileRoot, path), 'utf8');
}

describe('native system-model wiring', () => {
  it('uses the real Apple Foundation Models runtime with streaming and cancellation', () => {
    const swift = readMobileFile('native/ios/AGIFoundationModels.swift');
    const bridge = readMobileFile('native/ios/AGIFoundationModels.m');

    expect(swift).toContain('import FoundationModels');
    expect(swift).toContain('SystemLanguageModel.default.isAvailable');
    expect(swift).toContain('LanguageModelSession(');
    expect(swift).toContain('streamResponse(to:');
    expect(swift).toContain('func cancel(requestId: String)');
    expect(swift).not.toContain('STUBBED:');
    expect(bridge).toContain('RCT_EXTERN_METHOD(cancel:');
  });

  it('uses Google ML Kit Prompt over AICore with capability gating and cancellation', () => {
    const plugin = readMobileFile('native/android/withAGIAICore.cjs');
    const kotlin = readMobileFile('native/android/AGIAICoreModule.kt');

    expect(plugin).toContain('com.google.mlkit:genai-prompt:1.0.0-beta2');
    expect(kotlin).toContain('model.checkStatus()');
    expect(kotlin).toContain('FeatureStatus.AVAILABLE');
    expect(kotlin).toContain('model.generateContentStream(');
    expect(kotlin).toContain('fun cancel(requestId: String)');
  });
});
