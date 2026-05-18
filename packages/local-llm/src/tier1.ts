import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type { GenerateOptions, GenerateResult } from './types';

export async function tier1Generate(opts: GenerateOptions): Promise<GenerateResult> {
  const requestId = opts.requestId ?? String(Date.now());
  const messages = (opts.messages ?? []).filter((m) => m.role !== 'system');
  const systemPrompt = opts.systemPrompt ?? '';

  if (Platform.OS === 'ios') {
    const mod = NativeModules.AGIFoundationModels;
    if (!mod) throw new Error('AGIFoundationModels native module not available');
    const emitter = new NativeEventEmitter(mod);
    const sub = emitter.addListener('AGIFoundationModels.token', (event) => {
      if (event.requestId !== requestId) return;
      if (!event.done) opts.onToken?.(event.token);
      if (event.done) opts.onDone?.({ aborted: !!event.aborted, reason: event.reason });
    });
    try {
      const text = await mod.generate(opts.prompt, systemPrompt, messages, requestId);
      return { text, runtime: 'foundation_models', aborted: false };
    } finally {
      sub.remove();
    }
  }

  if (Platform.OS === 'android') {
    const mod = NativeModules.AGIAICore;
    if (!mod) throw new Error('AGIAICore native module not available');
    const emitter = new NativeEventEmitter(mod);
    const sub = emitter.addListener('AGIAICore.token', (event) => {
      if (event.requestId !== requestId) return;
      if (!event.done) opts.onToken?.(event.token);
      if (event.done) opts.onDone?.({ aborted: !!event.aborted, reason: event.reason });
    });
    try {
      const text = await mod.generate(opts.prompt, systemPrompt, messages, requestId);
      return { text, runtime: 'aicore', aborted: false };
    } finally {
      sub.remove();
    }
  }

  throw new Error('Tier 1 not available on this platform');
}
