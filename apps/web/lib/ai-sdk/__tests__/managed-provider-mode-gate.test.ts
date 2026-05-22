import { describe, expect, it } from 'vitest';
import {
  MANAGED_AI_GATEWAY_PROVIDER_MODE_HEADER,
  resolveManagedAiGatewayProviderMode,
} from '../managed-provider-mode-gate';

describe('managed AI Gateway provider-mode gate', () => {
  it('fails closed when provider mode is not explicit', () => {
    const decision = resolveManagedAiGatewayProviderMode({});

    expect(decision).toMatchObject({
      allowed: false,
      code: 'provider_mode_required',
    });
  });

  it.each(['Local', 'DirectByok'])('rejects %s mode before the Vercel AI Gateway path', (mode) => {
    const decision = resolveManagedAiGatewayProviderMode({ headerProviderMode: mode });

    expect(decision).toMatchObject({
      allowed: false,
      code: 'provider_mode_not_managed',
      receivedProviderMode: mode,
    });
  });

  it.each(['ManagedGateway', 'ManagedNative'])('allows explicit managed mode %s', (mode) => {
    const decision = resolveManagedAiGatewayProviderMode({ headerProviderMode: mode });

    expect(decision).toMatchObject({
      allowed: true,
      providerMode: mode,
    });
  });

  it('accepts body providerMode when the header is absent', () => {
    const decision = resolveManagedAiGatewayProviderMode({ bodyProviderMode: 'ManagedGateway' });

    expect(decision).toMatchObject({
      allowed: true,
      providerMode: 'ManagedGateway',
    });
  });

  it('accepts legacy snake_case provider_mode when the header is absent', () => {
    const decision = resolveManagedAiGatewayProviderMode({
      bodyProviderModeSnake: 'ManagedNative',
    });

    expect(decision).toMatchObject({
      allowed: true,
      providerMode: 'ManagedNative',
    });
  });

  it('rejects conflicting header and body modes', () => {
    const decision = resolveManagedAiGatewayProviderMode({
      headerProviderMode: 'ManagedGateway',
      bodyProviderMode: 'ManagedNative',
    });

    expect(decision).toMatchObject({
      allowed: false,
      code: 'provider_mode_conflict',
      receivedProviderMode: 'ManagedGateway,ManagedNative',
    });
  });

  it('exports the canonical provider-mode header name', () => {
    expect(MANAGED_AI_GATEWAY_PROVIDER_MODE_HEADER).toBe('x-agi-provider-mode');
  });
});
