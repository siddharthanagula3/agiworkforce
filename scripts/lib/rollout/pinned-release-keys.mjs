import { createPublicKey } from 'node:crypto';

const PUBLIC_KEY_BLOCK = /-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----/gu;
const SIGNING_KEY_ASSIGNMENT = /^RELEASE_SIGNING_KEY='([^']*)'$/mu;

export const RELEASE_KEY_CURVE = 'prime256v1';

export function releaseSigningKeyAssignment(installerSource) {
  return SIGNING_KEY_ASSIGNMENT.exec(installerSource)?.[1] ?? null;
}

export function pinnedReleaseKeys(installerSource) {
  return releaseSigningKeyAssignment(installerSource)?.match(PUBLIC_KEY_BLOCK) ?? [];
}

function keyFailure(pem, position) {
  let key;
  try {
    key = createPublicKey(pem);
  } catch (error) {
    return `pinned key ${position} is not a readable public key (${error.code ?? error.message})`;
  }
  if (key.asymmetricKeyType !== 'ec') {
    return `pinned key ${position} is ${key.asymmetricKeyType}, but CLI releases are signed with an EC P-256 key`;
  }
  const curve = key.asymmetricKeyDetails?.namedCurve;
  if (curve !== RELEASE_KEY_CURVE) {
    return `pinned key ${position} uses ${curve}, but CLI releases are signed with P-256 (${RELEASE_KEY_CURVE})`;
  }
  return null;
}

export function pinnedReleaseKeyFailures(installerSource) {
  if (releaseSigningKeyAssignment(installerSource) === null) {
    return ["install.sh has no RELEASE_SIGNING_KEY='...' assignment to read the pinned keys from"];
  }
  const keys = pinnedReleaseKeys(installerSource);
  const failures = [];
  if (keys.length === 0) {
    failures.push(
      'RELEASE_SIGNING_KEY pins no public key, so neither the installer nor agi update could verify a release',
    );
  }
  if ((installerSource.match(PUBLIC_KEY_BLOCK) ?? []).length !== keys.length) {
    failures.push(
      'a public key block sits outside RELEASE_SIGNING_KEY, where the installer never reads it',
    );
  }
  keys.forEach((pem, index) => {
    const failure = keyFailure(pem, index + 1);
    if (failure) failures.push(failure);
  });
  return failures;
}
