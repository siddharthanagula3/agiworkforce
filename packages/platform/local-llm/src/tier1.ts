import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type { GenerateOptions, GenerateResult } from './types';

type Tier1DoneEvent = { aborted: boolean; reason?: string };

let fallbackRequestSequence = 0;

export async function tier1Generate(opts: GenerateOptions): Promise<GenerateResult> {
  const requestId = opts.requestId ?? createFallbackRequestId();
  const messages = (opts.messages ?? []).filter((m) => m.role !== 'system');
  const systemPrompt = opts.systemPrompt ?? '';

  if (opts.signal?.aborted) {
    opts.onDone?.({ aborted: true, reason: 'cancel' });
    return {
      text: '',
      runtime: Platform.OS === 'android' ? 'aicore' : 'foundation_models',
      aborted: true,
    };
  }

  if (Platform.OS === 'ios') {
    const mod = NativeModules.AGIFoundationModels;
    if (!mod) throw new Error('AGIFoundationModels native module not available');
    const emitter = new NativeEventEmitter(mod);
    const state: { doneEvent: Tier1DoneEvent | null } = { doneEvent: null };
    const sub = emitter.addListener('AGIFoundationModels.token', (event) => {
      if (event.requestId !== requestId) return;
      if (!event.done && !opts.signal?.aborted) opts.onToken?.(event.token);
      if (event.done) {
        state.doneEvent = makeDoneEvent(event.aborted, event.reason);
        opts.onDone?.(state.doneEvent);
      }
    });
    const abortHandler = () => {
      if (typeof mod.cancel === 'function') void mod.cancel(requestId);
    };
    opts.signal?.addEventListener('abort', abortHandler, { once: true });
    try {
      const text = await mod.generate(opts.prompt, systemPrompt, messages, requestId);
      const aborted = !!state.doneEvent?.aborted || !!opts.signal?.aborted;
      if (!state.doneEvent) opts.onDone?.({ aborted });
      return { text: aborted ? '' : text, runtime: 'foundation_models', aborted };
    } finally {
      opts.signal?.removeEventListener('abort', abortHandler);
      sub.remove();
    }
  }

  if (Platform.OS === 'android') {
    const mod = NativeModules.AGIAICore;
    if (!mod) throw new Error('AGIAICore native module not available');
    const emitter = new NativeEventEmitter(mod);
    const state: { doneEvent: Tier1DoneEvent | null } = { doneEvent: null };
    const sub = emitter.addListener('AGIAICore.token', (event) => {
      if (event.requestId !== requestId) return;
      if (!event.done && !opts.signal?.aborted) opts.onToken?.(event.token);
      if (event.done) {
        state.doneEvent = makeDoneEvent(event.aborted, event.reason);
        opts.onDone?.(state.doneEvent);
      }
    });
    const abortHandler = () => {
      if (typeof mod.cancel === 'function') void mod.cancel(requestId);
    };
    opts.signal?.addEventListener('abort', abortHandler, { once: true });
    try {
      const text = await mod.generate(opts.prompt, systemPrompt, messages, requestId);
      const aborted = !!state.doneEvent?.aborted || !!opts.signal?.aborted;
      if (!state.doneEvent) opts.onDone?.({ aborted });
      return { text: aborted ? '' : text, runtime: 'aicore', aborted };
    } finally {
      opts.signal?.removeEventListener('abort', abortHandler);
      sub.remove();
    }
  }

  throw new Error('Tier 1 not available on this platform');
}

function createFallbackRequestId(): string {
  fallbackRequestSequence = (fallbackRequestSequence + 1) % Number.MAX_SAFE_INTEGER;
  return `tier1-${Date.now().toString(36)}-${fallbackRequestSequence.toString(36)}`;
}

function makeDoneEvent(aborted: unknown, reason: unknown): Tier1DoneEvent {
  if (typeof reason === 'string' && reason.length > 0) {
    return { aborted: !!aborted, reason };
  }
  return { aborted: !!aborted };
}
