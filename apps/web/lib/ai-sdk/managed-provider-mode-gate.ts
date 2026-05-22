import type { ProviderMode } from '@agiworkforce/types';

export const MANAGED_AI_GATEWAY_PROVIDER_MODE_HEADER = 'x-agi-provider-mode';

export type ManagedAiGatewayProviderMode = Extract<
  ProviderMode,
  'ManagedGateway' | 'ManagedNative'
>;

export type ManagedAiGatewayDenialCode =
  | 'provider_mode_required'
  | 'provider_mode_conflict'
  | 'provider_mode_invalid'
  | 'provider_mode_not_managed';

export interface ManagedAiGatewayModeInput {
  headerProviderMode?: string | null;
  bodyProviderMode?: string | null;
  bodyProviderModeSnake?: string | null;
}

export type ManagedAiGatewayModeDecision =
  | {
      allowed: true;
      providerMode: ManagedAiGatewayProviderMode;
    }
  | {
      allowed: false;
      code: ManagedAiGatewayDenialCode;
      message: string;
      receivedProviderMode?: string;
    };

const PROVIDER_MODES = new Set<ProviderMode>([
  'Local',
  'DirectByok',
  'ManagedGateway',
  'ManagedNative',
]);

const MANAGED_PROVIDER_MODES = new Set<ManagedAiGatewayProviderMode>([
  'ManagedGateway',
  'ManagedNative',
]);

function normalizeProviderMode(mode: string): string {
  return mode.trim();
}

export function resolveManagedAiGatewayProviderMode(
  input: ManagedAiGatewayModeInput,
): ManagedAiGatewayModeDecision {
  const modes = [input.headerProviderMode, input.bodyProviderMode, input.bodyProviderModeSnake]
    .filter((mode): mode is string => typeof mode === 'string' && mode.trim().length > 0)
    .map(normalizeProviderMode);

  if (modes.length === 0) {
    return {
      allowed: false,
      code: 'provider_mode_required',
      message:
        'Managed AI Gateway requests must explicitly set providerMode to ManagedGateway or ManagedNative.',
    };
  }

  const uniqueModes = new Set(modes);
  if (uniqueModes.size > 1) {
    return {
      allowed: false,
      code: 'provider_mode_conflict',
      message: 'Conflicting providerMode values were supplied.',
      receivedProviderMode: modes.join(','),
    };
  }

  const [providerMode] = modes;
  if (!PROVIDER_MODES.has(providerMode as ProviderMode)) {
    return {
      allowed: false,
      code: 'provider_mode_invalid',
      message: `Unknown providerMode "${providerMode}".`,
      receivedProviderMode: providerMode,
    };
  }

  if (!MANAGED_PROVIDER_MODES.has(providerMode as ManagedAiGatewayProviderMode)) {
    return {
      allowed: false,
      code: 'provider_mode_not_managed',
      message: `Provider mode "${providerMode}" cannot use the managed AI Gateway path.`,
      receivedProviderMode: providerMode,
    };
  }

  return {
    allowed: true,
    providerMode: providerMode as ManagedAiGatewayProviderMode,
  };
}
