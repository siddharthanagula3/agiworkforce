
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  deriveKeyPairFromSeed,
  makeSignedContainer,
  tamperContainerPayload,
} from '../src/test-support';
import { POLICY_CONTAINER_FORMAT } from '../src/org-policy';
import { LICENSE_CONTAINER_FORMAT } from '../src/verify';

const here = dirname(fileURLToPath(import.meta.url));
const licenseFixturesDir = join(here, '..', 'src', '__fixtures__');
const policyFixturesDir = join(here, '..', 'src', '__fixtures__', 'org-policy');

const rootKey1 = deriveKeyPairFromSeed('agi-license-root-key-1');
const rootKey2 = deriveKeyPairFromSeed('agi-license-root-key-2');
const attackerKey = deriveKeyPairFromSeed('agi-attacker-key');
const policyKey1 = deriveKeyPairFromSeed('agi-org-policy-key-1');
const forgedPolicyKey = deriveKeyPairFromSeed('agi-forged-policy-key');

const ROOT_PUBLIC_KEYS = [rootKey1.publicKeyB64, rootKey2.publicKeyB64];

const REFERENCE_NOW_MS = Date.UTC(2026, 6, 1, 0, 0, 0);
const DAY = 86_400_000;
const ORG_ID = 'org_acme';

function baseClaims() {
  return {
    licenseId: 'lic_0001',
    orgId: ORG_ID,
    orgName: 'Acme, Inc.',
    edition: 'enterprise' as const,
    seats: 50,
    issuedAt: REFERENCE_NOW_MS - 30 * DAY,
    expiresAt: REFERENCE_NOW_MS + 30 * DAY,
    graceDays: 14,
    features: ['example-flag-a', 'example-flag-b'],
    policyKeys: [policyKey1.publicKeyB64],
  };
}

interface LicenseCase {
  file: string;
  nowMs: number;
  bytes: Uint8Array;
  expect: { ok: true; graceActive: boolean } | { ok: false; code: string };
  note: string;
}

const licenseCases: LicenseCase[] = [];

function addLicense(
  file: string,
  bytes: Uint8Array,
  nowMs: number,
  expect: LicenseCase['expect'],
  note: string,
): void {
  licenseCases.push({ file, nowMs, bytes, expect, note });
}

addLicense(
  'valid.agilicense',
  makeSignedContainer(baseClaims(), rootKey1.privateKey, LICENSE_CONTAINER_FORMAT),
  REFERENCE_NOW_MS,
  { ok: true, graceActive: false },
  'Honestly signed by root key 1; now is inside [issuedAt, expiresAt].',
);

addLicense(
  'valid-rotated-key.agilicense',
  makeSignedContainer(
    { ...baseClaims(), licenseId: 'lic_0002' },
    rootKey2.privateKey,
    LICENSE_CONTAINER_FORMAT,
  ),
  REFERENCE_NOW_MS,
  { ok: true, graceActive: false },
  'Signed by root key 2 (rotation). Accepted because root key 2 is in rootPublicKeys.',
);

addLicense(
  'wrong-key.agilicense',
  makeSignedContainer(
    { ...baseClaims(), licenseId: 'lic_0003' },
    attackerKey.privateKey,
    LICENSE_CONTAINER_FORMAT,
  ),
  REFERENCE_NOW_MS,
  { ok: false, code: 'bad_signature' },
  'Signed by an unauthorized key; no root key verifies it.',
);

addLicense(
  'tampered.agilicense',
  tamperContainerPayload(
    makeSignedContainer(baseClaims(), rootKey1.privateKey, LICENSE_CONTAINER_FORMAT),
  ),
  REFERENCE_NOW_MS,
  { ok: false, code: 'bad_signature' },
  'Payload base64 byte-flipped after signing; signature no longer matches.',
);

addLicense(
  'expired-past-grace.agilicense',
  makeSignedContainer(
    {
      ...baseClaims(),
      licenseId: 'lic_0005',
      expiresAt: REFERENCE_NOW_MS - 30 * DAY,
      graceDays: 14,
    },
    rootKey1.privateKey,
    LICENSE_CONTAINER_FORMAT,
  ),
  REFERENCE_NOW_MS,
  { ok: false, code: 'expired' },
  'now is past expiresAt + graceDays. Distinct "expired" verdict → caller degrades to free tier.',
);

addLicense(
  'expired-in-grace.agilicense',
  makeSignedContainer(
    {
      ...baseClaims(),
      licenseId: 'lic_0006',
      expiresAt: REFERENCE_NOW_MS - 5 * DAY,
      graceDays: 14,
    },
    rootKey1.privateKey,
    LICENSE_CONTAINER_FORMAT,
  ),
  REFERENCE_NOW_MS,
  { ok: true, graceActive: true },
  'now is past expiresAt but within graceDays. Still valid; graceActive=true (renewal warning).',
);

addLicense(
  'not-yet-valid.agilicense',
  makeSignedContainer(
    {
      ...baseClaims(),
      licenseId: 'lic_0007',
      issuedAt: REFERENCE_NOW_MS + 10 * DAY,
      expiresAt: REFERENCE_NOW_MS + 60 * DAY,
    },
    rootKey1.privateKey,
    LICENSE_CONTAINER_FORMAT,
  ),
  REFERENCE_NOW_MS,
  { ok: false, code: 'not_yet_valid' },
  'issuedAt is in the future relative to now.',
);

addLicense(
  'malformed-json.agilicense',
  new TextEncoder().encode('this is not a license'),
  REFERENCE_NOW_MS,
  { ok: false, code: 'malformed' },
  'Raw bytes are not a JSON container.',
);

{
  const { seats, ...claimsWithoutSeats } = baseClaims();
  void seats;
  addLicense(
    'malformed-schema.agilicense',
    makeSignedContainer(claimsWithoutSeats, rootKey1.privateKey, LICENSE_CONTAINER_FORMAT),
    REFERENCE_NOW_MS,
    { ok: false, code: 'malformed' },
    'Signature is valid, but claims omit a required field → schema rejects (proves sig-before-schema ordering yields a structured verdict, never a throw).',
  );
}

addLicense(
  'wrong-format.agilicense',
  makeSignedContainer(baseClaims(), rootKey1.privateKey, POLICY_CONTAINER_FORMAT),
  REFERENCE_NOW_MS,
  { ok: false, code: 'malformed' },
  'Container format is "agipolicy-v1", not "agilicense-v1".',
);

const policyLicenseClaims = baseClaims();

function basePolicy() {
  return {
    policyId: 'pol_0001',
    orgId: ORG_ID,
    version: 1,
    issuedAt: REFERENCE_NOW_MS - 10 * DAY,
    allowedProviders: ['anthropic', 'openai'],
    allowedModels: ['local:*'],
    byok: 'forbidden' as const,
    egress: { managedCloud: false, byokDomainsAllowlist: [] as string[] },
    retentionDays: 30,
    auditExport: { required: true },
  };
}

const priorPolicyBaseline = {
  allowedProviders: ['anthropic'],
  allowedModels: ['local:*'],
  byok: 'forbidden' as const,
  egress: { managedCloud: false, byokDomainsAllowlist: [] as string[] },
  retentionDays: 30,
  auditExport: { required: true },
};

interface PolicyCase {
  file: string;
  nowMs: number;
  bytes: Uint8Array;
  baseline?: typeof priorPolicyBaseline;
  expect: { ok: true } | { ok: false; code: string };
  note: string;
}

const policyCases: PolicyCase[] = [];

function addPolicy(
  file: string,
  bytes: Uint8Array,
  expect: PolicyCase['expect'],
  note: string,
  baseline?: typeof priorPolicyBaseline,
): void {
  policyCases.push({ file, nowMs: REFERENCE_NOW_MS, bytes, baseline, expect, note });
}

addPolicy(
  'valid-tightening.agipolicy',
  makeSignedContainer(basePolicy(), policyKey1.privateKey, POLICY_CONTAINER_FORMAT),
  { ok: true },
  'Restricts providers, forbids BYOK, blocks managed-cloud egress, bounds retention — all tighter than the default baseline.',
);

addPolicy(
  'valid-unrestricted.agipolicy',
  makeSignedContainer(
    {
      ...basePolicy(),
      policyId: 'pol_0002',
      allowedProviders: ['*'],
      allowedModels: ['*'],
      byok: 'allowed' as const,
      egress: { managedCloud: true, byokDomainsAllowlist: ['*'] },
      retentionDays: undefined,
      auditExport: { required: false },
    },
    policyKey1.privateKey,
    POLICY_CONTAINER_FORMAT,
  ),
  { ok: true },
  'Every field equals the default baseline (not MORE permissive) → accepted.',
);

addPolicy(
  'forged-key.agipolicy',
  makeSignedContainer(
    { ...basePolicy(), policyId: 'pol_0003' },
    forgedPolicyKey.privateKey,
    POLICY_CONTAINER_FORMAT,
  ),
  { ok: false, code: 'bad_signature' },
  'Signed by a key absent from the license policyKeys → not authorized.',
);

addPolicy(
  'tampered.agipolicy',
  tamperContainerPayload(
    makeSignedContainer(basePolicy(), policyKey1.privateKey, POLICY_CONTAINER_FORMAT),
  ),
  { ok: false, code: 'bad_signature' },
  'Payload byte-flipped after signing.',
);

addPolicy(
  'org-mismatch.agipolicy',
  makeSignedContainer(
    { ...basePolicy(), policyId: 'pol_0005', orgId: 'org_other' },
    policyKey1.privateKey,
    POLICY_CONTAINER_FORMAT,
  ),
  { ok: false, code: 'org_mismatch' },
  'Signature is valid but the policy binds a different org than the license.',
);

addPolicy(
  'not-yet-valid.agipolicy',
  makeSignedContainer(
    { ...basePolicy(), policyId: 'pol_0006', issuedAt: REFERENCE_NOW_MS + 10 * DAY },
    policyKey1.privateKey,
    POLICY_CONTAINER_FORMAT,
  ),
  { ok: false, code: 'not_yet_valid' },
  'Policy issuedAt is after now.',
);

addPolicy(
  'over-granting.agipolicy',
  makeSignedContainer(
    {
      ...basePolicy(),
      policyId: 'pol_0007',
      version: 2,
      allowedProviders: ['anthropic', 'openai', 'google'], // adds providers
      byok: 'allowed' as const, // loosens BYOK
      egress: { managedCloud: true, byokDomainsAllowlist: ['*'] }, // re-enables egress
      retentionDays: 90, // retains longer
      auditExport: { required: false }, // drops required audit
    },
    policyKey1.privateKey,
    POLICY_CONTAINER_FORMAT,
  ),
  { ok: false, code: 'not_tightening' },
  'Evaluated against the priorPolicyBaseline: re-enables managed cloud, broadens providers, loosens BYOK, extends retention, drops audit → violates monotonic tightening.',
  priorPolicyBaseline,
);

{
  const { byok, ...policyWithoutByok } = basePolicy();
  void byok;
  addPolicy(
    'malformed-schema.agipolicy',
    makeSignedContainer(
      { ...policyWithoutByok, policyId: 'pol_0008' },
      policyKey1.privateKey,
      POLICY_CONTAINER_FORMAT,
    ),
    { ok: false, code: 'malformed' },
    'Signature valid, but a required field is missing → schema rejects.',
  );
}

function writeCorpus(
  dir: string,
  files: { name: string; bytes: Uint8Array }[],
  manifest: unknown,
): void {
  mkdirSync(dir, { recursive: true });
  for (const { name, bytes } of files) {
    writeFileSync(join(dir, name), Buffer.from(bytes));
  }
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

writeCorpus(
  licenseFixturesDir,
  licenseCases.map((c) => ({ name: c.file, bytes: c.bytes })),
  {
    description:
      'Cross-language license verification corpus. Replay: verifyLicense(readFile(file), rootPublicKeys, nowMs) must equal expect.',
    rootPublicKeys: ROOT_PUBLIC_KEYS,
    referenceNowMs: REFERENCE_NOW_MS,
    cases: licenseCases.map((c) => ({
      file: c.file,
      nowMs: c.nowMs,
      expect: c.expect,
      note: c.note,
    })),
  },
);

writeCorpus(
  policyFixturesDir,
  policyCases.map((c) => ({ name: c.file, bytes: c.bytes })),
  {
    description:
      'Cross-language org-policy verification corpus. Replay: verifyOrgPolicy(readFile(file), licenseClaims, nowMs, { baseline }) must equal expect. When a case omits "baseline", the default product baseline is used.',
    licenseClaims: policyLicenseClaims,
    referenceNowMs: REFERENCE_NOW_MS,
    cases: policyCases.map((c) => ({
      file: c.file,
      nowMs: c.nowMs,
      ...(c.baseline ? { baseline: c.baseline } : {}),
      expect: c.expect,
      note: c.note,
    })),
  },
);

console.log('Generated license fixtures:', licenseCases.length);
console.log('Generated org-policy fixtures:', policyCases.length);
console.log('root key 1 (pub):', rootKey1.publicKeyB64);
console.log('root key 2 (pub):', rootKey2.publicKeyB64);
console.log('policy key 1 (pub):', policyKey1.publicKeyB64);
console.log('attacker key (pub):', attackerKey.publicKeyB64);
console.log('forged policy key (pub):', forgedPolicyKey.publicKeyB64);
console.log('reference now ms:', REFERENCE_NOW_MS);
