import { expect } from 'vitest';
import type { McpServerConfig } from '@agiworkforce/mcp';

export async function expectSdkBearerCredential(
  config: unknown,
  expectedToken: string,
): Promise<void> {
  const candidate = config as McpServerConfig | undefined;
  const provider = candidate?.authProvider;
  expect(provider).toBeDefined();
  if (!provider || !('token' in provider)) throw new Error('Expected the SDK bearer auth provider');
  expect(await provider.token()).toBe(expectedToken);
}
