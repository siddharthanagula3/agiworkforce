import { NativeModules, Platform } from 'react-native';
import { create } from 'zustand';
import { getSystemModelForTier1Runtime, type DeviceCapabilities } from '@agiworkforce/local-llm';

export type SystemModelState = 'ready' | 'not_eligible' | 'turned_off' | 'preparing' | 'failed';

export type UnusableSystemModelState = Exclude<SystemModelState, 'ready'>;
export type CheckedSystemModelState = Exclude<SystemModelState, 'failed'>;

const IOS_UNAVAILABLE_STATES: Readonly<
  Record<string, Exclude<SystemModelState, 'ready' | 'failed'>>
> = {
  apple_intelligence_not_enabled: 'turned_off',
  model_not_ready: 'preparing',
  os_too_old: 'not_eligible',
  device_not_eligible: 'not_eligible',
};

// Every code native/ios/AGIFoundationModels.swift rejects with. 'model' says the
// model itself cannot answer here; 'request' failures, such as a refusal, an
// unsupported language, a long conversation or a busy model, count only when the
// device then stops reporting the model as available.
export const APPLE_INTELLIGENCE_FAILURE_SCOPES = {
  APPLE_INTELLIGENCE_UNAVAILABLE: 'model',
  APPLE_INTELLIGENCE_ASSETS_UNAVAILABLE: 'model',
  APPLE_INTELLIGENCE_FAILED: 'model',
  APPLE_INTELLIGENCE_CONTEXT_EXCEEDED: 'request',
  APPLE_INTELLIGENCE_REFUSED: 'request',
  APPLE_INTELLIGENCE_RATE_LIMITED: 'request',
  APPLE_INTELLIGENCE_UNSUPPORTED_LANGUAGE: 'request',
} as const satisfies Record<string, 'model' | 'request'>;

const MODEL_UNUSABLE_FAILURES = [
  ...Object.entries(APPLE_INTELLIGENCE_FAILURE_SCOPES)
    .filter(([, scope]) => scope === 'model')
    .map(([code]) => code),
  'native module not available',
  'No local runtime',
];

export function platformSystemModelId(platform: string = Platform.OS): string | null {
  const runtime =
    platform === 'ios' ? 'foundation_models' : platform === 'android' ? 'aicore' : null;
  return getSystemModelForTier1Runtime(runtime)?.id ?? null;
}

export function systemModelState(
  modelId: string,
  caps: DeviceCapabilities | null,
  nativeStatus: string | null,
): CheckedSystemModelState {
  if (caps?.tier1Runtime && getSystemModelForTier1Runtime(caps.tier1Runtime)?.id === modelId) {
    return 'ready';
  }
  if (caps?.tier1Status === 'downloadable' || caps?.tier1Status === 'downloading') {
    return 'preparing';
  }
  return (nativeStatus ? IOS_UNAVAILABLE_STATES[nativeStatus] : undefined) ?? 'not_eligible';
}

export function isTemporarySystemModelState(state: UnusableSystemModelState): boolean {
  return state === 'preparing' || state === 'turned_off';
}

export function systemModelUnavailableNote(
  state: UnusableSystemModelState,
  modelName: string,
): string {
  switch (state) {
    case 'turned_off':
      return `Turn on ${modelName} in Settings to use it.`;
    case 'preparing':
      return 'Still getting ready on this device. Try again later.';
    case 'failed':
      return 'Could not answer on this device. Choose another model.';
    case 'not_eligible':
      return 'Not available on this device.';
  }
}

export async function readSystemModelNativeStatus(
  platform: string = Platform.OS,
): Promise<string | null> {
  if (platform !== 'ios') return null;
  const native = (NativeModules as Record<string, unknown>)['AGIFoundationModels'] as
    { getCapabilities?: () => Promise<{ status?: unknown } | null> } | undefined;
  if (!native?.getCapabilities) return null;
  try {
    const caps = await native.getCapabilities();
    return typeof caps?.status === 'string' ? caps.status : null;
  } catch {
    return null;
  }
}

export function isAbortedTurn(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function isSystemModelUnusableError(error: unknown): boolean {
  if (isAbortedTurn(error)) return false;
  const raw = error instanceof Error ? error.message : String(error ?? '');
  return MODEL_UNUSABLE_FAILURES.some((code) => raw.includes(code));
}

interface SystemModelSessionState {
  failedModelIds: string[];
  unreadySinceFailureIds: string[];
  markFailed: (modelId: string) => void;
}

export const useSystemModelSession = create<SystemModelSessionState>()((set) => ({
  failedModelIds: [],
  unreadySinceFailureIds: [],
  markFailed: (modelId) =>
    set((state) =>
      state.failedModelIds.includes(modelId)
        ? state
        : {
            failedModelIds: [...state.failedModelIds, modelId],
            unreadySinceFailureIds: state.unreadySinceFailureIds.filter((id) => id !== modelId),
          },
    ),
}));

export function systemModelFailedThisSession(modelId: string): boolean {
  return useSystemModelSession.getState().failedModelIds.includes(modelId);
}

// A fresh check that cannot answer says why in its own words. A model that
// failed while the device called it ready stays out until the device has
// reported it not ready and then ready again, so the session can recover once it
// finishes preparing or is turned back on.
export function settleSystemModelState(
  modelId: string,
  checked: CheckedSystemModelState,
): SystemModelState {
  const session = useSystemModelSession.getState();
  if (!session.failedModelIds.includes(modelId)) return checked;
  if (checked !== 'ready') {
    if (!session.unreadySinceFailureIds.includes(modelId)) {
      useSystemModelSession.setState({
        unreadySinceFailureIds: [...session.unreadySinceFailureIds, modelId],
      });
    }
    return checked;
  }
  if (!session.unreadySinceFailureIds.includes(modelId)) return 'failed';
  useSystemModelSession.setState({
    failedModelIds: session.failedModelIds.filter((id) => id !== modelId),
    unreadySinceFailureIds: session.unreadySinceFailureIds.filter((id) => id !== modelId),
  });
  return 'ready';
}
