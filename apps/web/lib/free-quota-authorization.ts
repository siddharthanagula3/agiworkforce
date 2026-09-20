import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { getProviderOffering } from '@agiworkforce/types';

export const VerificationSchema = z.object({
  localUserId: z.string().min(1).optional(),
  sourceUrl: z.literal('https://home.qwencloud.com/benefits'),
  checkedAtMs: z.number().int().positive(),
  credentialSha256: z.string().regex(/^[a-f0-9]{64}$/),
  offerings: z.array(
    z.object({
      offeringKey: z.string().min(1),
      quotaOnly: z.literal(true),
      unit: z.enum(['tokens', 'images', 'seconds']),
      remaining: z.number().finite().nonnegative(),
      expiresAtMs: z.number().int().positive(),
    }),
  ),
});

export const PolicySchema = z.object({
  verificationMaxAgeMs: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  minimumChatQuota: z.number().int().positive(),
  imageSize: z.string().regex(/^\d+\*\d+$/),
  videoSize: z.string().regex(/^\d+\*\d+$/),
  videoSeconds: z.number().int().positive(),
  requestTimeoutMs: z.number().int().positive(),
  pollIntervalMs: z.number().int().positive(),
  maxPolls: z.number().int().positive(),
});

type Policy = z.infer<typeof PolicySchema>;
type QuotaVerification = z.infer<typeof VerificationSchema>;

export function quotaCredentialMatches(verification: QuotaVerification, apiKey: string): boolean {
  return (
    Boolean(apiKey) &&
    verification.credentialSha256 === createHash('sha256').update(apiKey).digest('hex')
  );
}

const exhaustionDirectory = () => resolve(process.cwd(), '.cache/qwen-quota-experiments/exhausted');

function exhaustionPath(verification: QuotaVerification, offeringKey: string, directory: string) {
  const key = JSON.stringify([
    verification.localUserId,
    verification.credentialSha256,
    verification.checkedAtMs,
    offeringKey,
  ]);
  return resolve(directory, createHash('sha256').update(key).digest('hex'));
}

export async function hasExhaustedFreeQuota(
  verification: QuotaVerification,
  offeringKey: string,
  directory = exhaustionDirectory(),
): Promise<boolean> {
  if (
    verification.offerings.some(
      (entry) => entry.offeringKey === offeringKey && entry.remaining === 0,
    )
  )
    return true;
  try {
    await access(exhaustionPath(verification, offeringKey, directory));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function markFreeQuotaExhausted(
  verification: QuotaVerification,
  offeringKey: string,
  directory = exhaustionDirectory(),
): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(exhaustionPath(verification, offeringKey, directory), '', {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}

export async function readLocalQuotaVerification() {
  const path = resolve(process.cwd(), '.cache/qwen-quota-experiments/account-verification.json');
  return VerificationSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}

export function validateQuotaProbeAuthorization(
  document: unknown,
  apiKey: string,
  offeringKey: string,
  policy: Policy,
  nowMs = Date.now(),
): void {
  const verification = VerificationSchema.parse(document);
  if (!quotaCredentialMatches(verification, apiKey)) {
    throw new Error('The verification does not belong to the configured credential.');
  }
  if (
    verification.checkedAtMs > nowMs ||
    nowMs - verification.checkedAtMs >= policy.verificationMaxAgeMs
  ) {
    throw new Error('Current account quota verification is required.');
  }
  const offering = getProviderOffering(offeringKey);
  if (!offering?.providerModelId || !offering.quotaProbeProtocol) {
    throw new Error('The exact model and experiment protocol must be resolved first.');
  }
  const matches = verification.offerings.filter((entry) => entry.offeringKey === offeringKey);
  if (matches.length !== 1)
    throw new Error('One account verification record is required for this offering.');
  const match = matches[0]!;
  const expectedUnit =
    offering.quotaProbeProtocol === 'chat'
      ? 'tokens'
      : offering.quotaProbeProtocol === 'video-async'
        ? 'seconds'
        : 'images';
  if (match.unit !== expectedUnit)
    throw new Error('The verified quota unit does not match this experiment.');
  const minimum =
    offering.quotaProbeProtocol === 'chat'
      ? policy.minimumChatQuota
      : offering.quotaProbeProtocol === 'video-async'
        ? policy.videoSeconds
        : 1;
  if (
    match.remaining < minimum ||
    match.expiresAtMs <= nowMs + policy.requestTimeoutMs + policy.maxPolls * policy.pollIntervalMs
  ) {
    throw new Error(
      'The verified free allocation is insufficient or expires during the experiment.',
    );
  }
}

export async function claimQuotaProbe(directory: string, key: string): Promise<string> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const claim = resolve(directory, `${createHash('sha256').update(key).digest('hex')}.json`);
  await writeFile(
    claim,
    JSON.stringify({ state: 'claimed', claimedAt: new Date().toISOString() }),
    { flag: 'wx', mode: 0o600 },
  );
  return claim;
}
