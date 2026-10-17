import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';

const require = createRequire(import.meta.url);
const electronBuilderRequire = createRequire(require.resolve('electron-builder'));
const builderRequire = createRequire(electronBuilderRequire.resolve('app-builder-lib'));
const { notarize } = builderRequire('@electron/notarize');

function credentials() {
  if (process.env.APPLE_API_KEY || process.env.APPLE_API_KEY_ID || process.env.APPLE_API_ISSUER) {
    for (const key of ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'])
      if (!process.env[key]) throw new Error(`${key} is required for installer notarization.`);
    return {
      appleApiKey: process.env.APPLE_API_KEY,
      appleApiKeyId: process.env.APPLE_API_KEY_ID,
      appleApiIssuer: process.env.APPLE_API_ISSUER,
    };
  }
  for (const key of ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'])
    if (!process.env[key]) throw new Error(`${key} is required for installer notarization.`);
  return {
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  };
}

async function main() {
  const files = process.argv.slice(2).map((file) => path.resolve(file));
  if (!files.length || files.some((file) => !file.endsWith('.dmg') || !statSync(file).isFile()))
    throw new Error('Pass the built DMG installer files explicitly.');
  const auth = credentials();
  const receipt = [];
  for (const file of files) {
    await notarize({ appPath: file, ...auth });
    receipt.push({
      file,
      notarizedAndStapled: true,
      sha256: createHash('sha256').update(readFileSync(file)).digest('hex'),
    });
    console.log(`Notarized and stapled ${path.basename(file)}`);
  }
  if (process.env.AGI_RELEASE_NOTARIZATION_RECEIPT)
    writeFileSync(process.env.AGI_RELEASE_NOTARIZATION_RECEIPT, JSON.stringify(receipt, null, 2));
}
main().catch((error) => {
  let message = String(error);
  for (const key of ['APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_PASSWORD', 'APPLE_API_PRIVATE_KEY']) {
    const value = process.env[key];
    if (value) message = message.replaceAll(value, '[REDACTED]');
  }
  console.error(message);
  process.exitCode = 1;
});
