import 'server-only';

import type { NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
import {
  ACCOUNT_SECURITY_HANDOFF_RETURN_PATH,
  MOBILE_APP_DEEP_LINK_SCHEME,
  type AccountSecurityHandoffClient,
} from '@agiworkforce/cloud-contracts/account-security';
import { DESKTOP_DEEP_LINK_SCHEME } from '@agiworkforce/local-runtime-contract';

import { createError } from '@/lib/errors';
import { recordAuditEvent } from '@/lib/security-audit';
import { hashHandoffCode, hashHandoffToken, newOpaqueToken } from './secrets';
import {
  completeHandoffAssertion,
  listCredentials,
  readOpenHandoff,
  recordCredentialUse,
  setHandoffChallenge,
} from './store';
import { authenticationOptions, verifyAssertion } from './webauthn';

const HANDOFF_SCHEMES: Readonly<Record<AccountSecurityHandoffClient, string>> = {
  desktop: DESKTOP_DEEP_LINK_SCHEME,
  mobile: MOBILE_APP_DEEP_LINK_SCHEME,
};

export async function beginHandoffVerification(
  ownerDb: DatabaseAdapter,
  handoff: string,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const open = await readOpenHandoff(ownerDb, hashHandoffToken(handoff));
  if (!open)
    throw createError.notFound('This link expired. Start again from the app.').asUserSafe();
  const credentials = await listCredentials(ownerDb, open.userId);
  if (credentials.length === 0) {
    throw createError.conflict('This account has no passkey or security key to verify with.');
  }
  const options = await authenticationOptions(credentials);
  if (!(await setHandoffChallenge(ownerDb, open, options.challenge))) {
    throw createError.notFound('This link expired. Start again from the app.').asUserSafe();
  }
  return options;
}

export async function finishHandoffVerification(
  ownerDb: DatabaseAdapter,
  handoff: string,
  response: unknown,
  request: NextRequest,
): Promise<string> {
  const open = await readOpenHandoff(ownerDb, hashHandoffToken(handoff));
  if (!open?.challenge) {
    throw createError.notFound('This link expired. Start again from the app.').asUserSafe();
  }
  const credentials = await listCredentials(ownerDb, open.userId);
  const verified = await verifyAssertion({
    response,
    expectedChallenge: open.challenge,
    credentials,
  });
  const code = newOpaqueToken();
  const accepted =
    verified !== null &&
    (await recordCredentialUse(ownerDb, open.userId, verified.credential.id, verified.signCount)) &&
    (await completeHandoffAssertion(ownerDb, {
      handoff: open,
      challenge: open.challenge,
      codeHash: hashHandoffCode(code),
    }));
  if (!accepted) {
    await recordAuditEvent({
      userId: open.userId,
      eventType: 'account_security_verification_failed',
      outcome: 'failure',
      severity: 'warning',
      request,
      detail: { resourceType: 'account_security', resourceId: 'handoff', surface: open.client },
    });
    throw createError.validation(
      'That passkey or security key could not be verified. Try again, or use a different one.',
    );
  }
  const returnUrl = new URL(
    `${HANDOFF_SCHEMES[open.client]}://${ACCOUNT_SECURITY_HANDOFF_RETURN_PATH}`,
  );
  returnUrl.searchParams.set('handoff', handoff);
  returnUrl.searchParams.set('code', code);
  return returnUrl.toString();
}
