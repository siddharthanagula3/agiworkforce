import { readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { getProviderOffering, getProviderOfferings } from '@agiworkforce/types';
import {
  VerificationSchema,
  PolicySchema,
  validateQuotaProbeAuthorization,
  claimQuotaProbe,
} from '../lib/free-quota-authorization';
export { validateQuotaProbeAuthorization, claimQuotaProbe } from '../lib/free-quota-authorization';
import { runQwenQuotaProbe, type QwenQuotaProbePolicy } from '@agiworkforce/providers-factory';

const WEB_ROOT = fileURLToPath(new URL('..', import.meta.url));

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    process.stdout.write(
      `${JSON.stringify(
        {
          usage:
            'pnpm exec tsx apps/web/scripts/qwen-quota-experiment.ts --offering <key> [--verification <local-json-path> --execute]',
          default: 'Preflight only; no provider request.',
          offerings: Object.entries(getProviderOfferings())
            .filter(([, offering]) => offering.quotaProbeProtocol)
            .map(([key, offering]) => ({
              key,
              name: offering.displayName,
              protocol: offering.quotaProbeProtocol,
            })),
          verification: {
            sourceUrl: 'Live Benefits page URL',
            checkedAtMs: 'Time the live account was checked, in Unix milliseconds',
            credentialSha256: 'SHA-256 of the exact configured API key; never store the key here',
            offerings: [
              'offeringKey',
              'quotaOnly: true, verified in the live console',
              'unit: tokens, images or seconds',
              'remaining: verified allocation balance',
              'expiresAtMs: allocation expiration',
            ],
          },
          evidence:
            'Private local results under apps/web/.cache/qwen-quota-experiments. A claimed run is never automatically resubmitted, including after timeout.',
          caution:
            'Create verification only after matching the key to the signed-in account and checking its current quota-only setting. Screenshots and successful model discovery are insufficient.',
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index < 0 ? undefined : args[index + 1];
  };
  const offeringKey = value('--offering');
  if (!offeringKey || !getProviderOffering(offeringKey)?.quotaProbeProtocol) {
    throw new Error(
      'Provide --offering with a catalog offering that has a verified experiment protocol.',
    );
  }
  const config = JSON.parse(
    await readFile(resolve(WEB_ROOT, 'config/free-pools.json'), 'utf8'),
  ) as { quotaExperimentPolicy?: unknown };
  const policy = PolicySchema.parse(config.quotaExperimentPolicy);
  const verificationPath = value('--verification');
  if (!args.includes('--execute')) {
    process.stdout.write(
      `${JSON.stringify({ status: 'preflight_only', offeringKey, policy, prerequisites: ['Account-bound verification file from the live console', 'Free quota only enabled for the exact offering', 'One execution per verification and offering; no fallback or automatic submission retry'] }, null, 2)}\n`,
    );
    return;
  }
  if (!verificationPath)
    throw new Error(
      'Generation is blocked: --verification must identify the current account quota evidence file.',
    );
  const localEnv = parseEnv(await readFile(resolve(WEB_ROOT, '.env.local'), 'utf8'));
  const apiKey = process.env['QWEN_API_KEY'] ?? localEnv['QWEN_API_KEY'] ?? '';
  const verification = VerificationSchema.parse(
    JSON.parse(await readFile(resolve(verificationPath), 'utf8')),
  );
  validateQuotaProbeAuthorization(verification, apiKey, offeringKey, policy);
  const claim = await claimQuotaProbe(
    resolve(WEB_ROOT, '.cache/qwen-quota-experiments'),
    `${verification.credentialSha256}:${verification.checkedAtMs}:${offeringKey}`,
  );
  let result: unknown;
  try {
    const probeResult = await runQwenQuotaProbe(
      offeringKey,
      apiKey,
      policy satisfies QwenQuotaProbePolicy,
    );
    result = probeResult;
    process.exitCode = probeResult.status === 'succeeded' ? 0 : 2;
  } catch {
    result = {
      status: 'unknown',
      message:
        'Provider request interrupted. Submission was not retried; inspect the provider account before another attempt.',
    };
    process.exitCode = 1;
  }
  const resultPath = `${claim}.tmp`;
  await writeFile(
    resultPath,
    JSON.stringify({ offeringKey, recordedAt: new Date().toISOString(), result }, null, 2),
    { mode: 0o600 },
  );
  await rename(resultPath, claim);
  process.stdout.write(`${JSON.stringify({ evidencePath: claim, result }, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Experiment failed'}\n`);
    process.exitCode = 1;
  });
}
