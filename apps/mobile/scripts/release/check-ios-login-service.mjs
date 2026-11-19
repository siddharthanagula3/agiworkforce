#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseAuthProviderIds } from '../../../../packages/client/client-runtime/src/authProviders.ts';

const VARIABLE = 'EXPO_PUBLIC_AGI_AUTH_PROVIDERS';
const EAS_JSON_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'eas.json');

function readEasJson() {
  return JSON.parse(readFileSync(EAS_JSON_PATH, 'utf8'));
}

export function profileBuildEnv(easJson, profile) {
  const profiles = easJson.build ?? {};
  const chain = [];
  for (let name = profile; name !== undefined; name = profiles[name].extends) {
    if (!profiles[name]) throw new Error(`eas.json has no build profile "${name}".`);
    if (chain.includes(name)) throw new Error(`eas.json build profile "${name}" extends itself.`);
    chain.push(name);
  }
  return Object.assign({}, ...chain.reverse().map((name) => profiles[name].env ?? {}));
}

export function checkIosLoginService({
  profile = 'production',
  easJson = readEasJson(),
  processValue = process.env[VARIABLE],
} = {}) {
  const built = profileBuildEnv(easJson, profile)[VARIABLE] || undefined;
  const fromProcess = processValue || undefined;

  if (built && fromProcess) {
    const builtIds = parseAuthProviderIds(built).join(',');
    const processIds = parseAuthProviderIds(fromProcess).join(',');
    if (builtIds !== processIds) {
      throw new Error(
        `eas.json profile "${profile}" builds with ${VARIABLE}=${builtIds}, but this environment sets ${processIds}; make them agree.`,
      );
    }
  }

  const configured = built ?? fromProcess;
  if (!configured) {
    throw new Error(`Set ${VARIABLE} for the iOS release build.`);
  }

  const providers = parseAuthProviderIds(configured);
  if (!providers.includes('apple')) {
    throw new Error(`iOS social sign-in requires Apple in ${VARIABLE}.`);
  }

  return providers;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { profile: { type: 'string' } } });
    const profile = values.profile ?? 'production';
    process.stdout.write(
      `iOS login providers for ${profile}: ${checkIosLoginService({ profile }).join(', ')}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'iOS login check failed'}\n`);
    process.exitCode = 1;
  }
}
