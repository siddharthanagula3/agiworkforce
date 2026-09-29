#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAuthProviderIds } from '../../../../packages/client/client-runtime/src/authProviders.ts';

export function checkIosLoginService(configured = process.env.EXPO_PUBLIC_AGI_AUTH_PROVIDERS) {
  if (!configured) {
    throw new Error('Set EXPO_PUBLIC_AGI_AUTH_PROVIDERS for the iOS release build.');
  }

  const providers = parseAuthProviderIds(configured);
  if (!providers.includes('apple')) {
    throw new Error('iOS social sign-in requires Apple in EXPO_PUBLIC_AGI_AUTH_PROVIDERS.');
  }

  return providers;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`iOS login providers: ${checkIosLoginService().join(', ')}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'iOS login check failed'}\n`);
    process.exitCode = 1;
  }
}
