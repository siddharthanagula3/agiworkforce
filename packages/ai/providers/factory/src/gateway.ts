import { createAnthropicAdapter } from '@agiworkforce/providers-anthropic';
import { createOpenAIAdapter, createOpenAICompatAdapter } from '@agiworkforce/providers-openai';
import type { ModelInfo, Provider, ProviderAdapter } from '@agiworkforce/types';

export type GatewayProtocol = 'openai_chat_completions' | 'openai_responses' | 'anthropic_messages';

export interface GatewayModelsSource {
  kind: 'static' | 'remote';
  path?: string;
  requiresKey?: boolean;
}

export interface GatewayPricingSource {
  kind: 'static' | 'remote';
  path?: string;
}

export interface GatewayGovernanceStub {
  dataRetentionClass: string;
  trainsOnInputs: string;
  source?: string;
  verifiedOn?: string;
  note?: string;
}

export interface GatewayEndpointDefinition {
  id: string;
  displayName: string;
  protocol: GatewayProtocol;
  baseUrlEnv: string;
  apiKeyEnv: string;
  extraHeaderEnvs?: Readonly<Record<string, string>>;
}

export interface GatewayDefinition extends GatewayEndpointDefinition {
  modelsSource: GatewayModelsSource;
  pricingSource: GatewayPricingSource;
  host: string;
  governance: GatewayGovernanceStub;
}

export type GatewayEnvSource = Readonly<Record<string, string | undefined>>;

const EMPTY_GATEWAY_CATALOG: readonly ModelInfo[] = [];

function requireEnv(
  env: GatewayEnvSource,
  name: string,
  gatewayId: string,
  purpose: string,
): string {
  const value = env[name];
  if (!value) {
    throw new Error(
      `Gateway "${gatewayId}" requires ${purpose}: set the ${name} environment variable.`,
    );
  }
  return value;
}

function resolveExtraHeaders(
  gateway: GatewayEndpointDefinition,
  env: GatewayEnvSource,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [headerName, envName] of Object.entries(gateway.extraHeaderEnvs ?? {})) {
    const value = env[envName];
    if (value) headers[headerName] = value;
  }
  return headers;
}

export function createGatewayAdapter(
  gateway: GatewayEndpointDefinition,
  env: GatewayEnvSource,
): ProviderAdapter {
  const baseUrl = requireEnv(env, gateway.baseUrlEnv, gateway.id, 'a base URL');
  const apiKey = requireEnv(env, gateway.apiKeyEnv, gateway.id, 'an API key');
  const extraHeaders = resolveExtraHeaders(gateway, env);
  const hasExtraHeaders = Object.keys(extraHeaders).length > 0;

  switch (gateway.protocol) {
    case 'openai_chat_completions':
      return createOpenAICompatAdapter(
        {
          id: gateway.id as Provider,
          label: gateway.displayName,
          apiKeyEnvVar: gateway.apiKeyEnv,
          apiKeyLabel: gateway.displayName,
          catalog: EMPTY_GATEWAY_CATALOG,
        },
        {
          apiKey,
          baseUrl,
          skipDiscovery: true,
          ...(hasExtraHeaders ? { extraHeaders } : {}),
        },
      );
    case 'openai_responses':
      return createOpenAIAdapter({ apiKey, baseUrl });
    case 'anthropic_messages':
      return createAnthropicAdapter({
        apiKey,
        baseUrl,
        ...(hasExtraHeaders ? { extraHeaders } : {}),
      });
    default: {
      const exhaustive: never = gateway.protocol;
      throw new Error(`Gateway "${gateway.id}" declares unknown protocol "${String(exhaustive)}"`);
    }
  }
}
