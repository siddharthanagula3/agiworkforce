import 'server-only';

import { randomBytes } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { requireCsrfToken } from '@/lib/csrf';
import { withErrorHandler } from '@/lib/error-handler';
import { createError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import { getClientIp, logSecurityEvent } from '@/lib/security-audit';
import { recordCopyrightNotice } from '@/lib/server/copyright-notices';
import { getNeonDb } from '@/lib/server/neon-db';
import { getHandoffConfig } from '@/lib/support/handoff/config';
import { sendSupportEmail } from '@/lib/support/handoff/resend-client';

import {
  findPublicTarget,
  normalizeToken,
  type PublicContentTarget,
} from '../admin/takedown/lib/public-target';
import { getRequestIdentity } from '@/lib/server/identity';

// Public intake for a rights-holder notice about content this deployment serves
// at a public URL. It is unauthenticated on purpose: the person whose work was
// republished has no account here.
//
// It records and forwards; it never unpublishes. Removal stays behind
// POST /api/admin/takedown so an anonymous allegation cannot be used to take a
// stranger's share offline.

const NoticeSchema = z.object({
  contentUrl: z.string().trim().min(1).max(2048),
  reporterName: z.string().trim().min(1).max(200),
  reporterEmail: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  reporterPhone: z.string().trim().min(1).max(60),
  reporterAddress: z.string().trim().min(1).max(500),
  rightsHolder: z.string().trim().max(200).optional(),
  workDescription: z.string().trim().min(1).max(2000),
  signature: z.string().trim().min(1).max(200),
  goodFaith: z.literal(true),
  accurate: z.literal(true),
  authorized: z.literal(true),
});

type Notice = z.infer<typeof NoticeSchema>;

const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const REFERENCE_LENGTH = 10;
const REFERENCE_ACCEPT_LIMIT =
  Math.floor(256 / REFERENCE_ALPHABET.length) * REFERENCE_ALPHABET.length;

function generateReference(): string {
  let out = '';
  while (out.length < REFERENCE_LENGTH) {
    for (const byte of randomBytes(REFERENCE_LENGTH - out.length)) {
      if (byte >= REFERENCE_ACCEPT_LIMIT) continue;
      out += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length];
    }
  }
  return `IP-${out}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

async function alertOperators(input: {
  reference: string;
  notice: Notice;
  target: PublicContentTarget;
  reporterUserId: string | null;
}): Promise<boolean> {
  const { reference, notice, target } = input;
  const environment = process.env['VERCEL_ENV'] ?? process.env['NODE_ENV'] ?? 'unknown';
  const text = [
    `Environment: ${environment}`,
    `Reference: ${reference}`,
    `Reported URL: ${notice.contentUrl}`,
    '',
    'WHAT IT RESOLVES TO',
    `Kind: ${target.kind}`,
    `Token: ${target.token}`,
    `Publisher account: ${target.ownerId}`,
    `Title: ${target.title}`,
    `Published: ${target.createdAt}`,
    '',
    'WHO SENT IT',
    `Name: ${notice.reporterName}`,
    `Email: ${notice.reporterEmail}`,
    `Phone: ${notice.reporterPhone}`,
    `Address: ${notice.reporterAddress}`,
    `Acting for: ${notice.rightsHolder || '(themselves)'}`,
    `Signed: ${notice.signature}`,
    `Reporter account: ${input.reporterUserId ?? '(not signed in)'}`,
    '',
    'THE WORK THEY SAY IS INFRINGED',
    notice.workDescription,
    '',
    'STATEMENTS',
    'Good-faith belief the use is unauthorised: affirmed',
    'Information in the notice is accurate: affirmed',
    'Authorised to act for the rights holder: affirmed under penalty of perjury',
    '',
    'NEXT STEP',
    'Nothing has been unpublished. To remove it, POST /api/admin/takedown as an',
    `admin with { "token": "${target.token}", "reason": "copyright notice ${reference}" }.`,
  ].join('\n');

  const sent = await sendSupportEmail({
    to: getHandoffConfig().fallbackEmail,
    subject: `[AGI IP] ${environment} copyright notice ${reference} (${target.kind})`,
    text,
    html: `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
    replyTo: notice.reporterEmail,
    idempotencyKey: `copyright-notice:${reference}`,
  });

  if (!sent.delivered) {
    logger.error(
      {
        event: 'copyright_notice_alert_undeliverable',
        reference,
        token: target.token,
        kind: target.kind,
        reason: sent.reason,
        detail: sent.detail,
      },
      'Copyright notice was recorded but no operator was notified',
    );
  }
  return sent.delivered;
}

async function handleNotice(request: NextRequest): Promise<NextResponse> {
  const csrfResponse = await requireCsrfToken(request);
  if (csrfResponse) return csrfResponse as NextResponse;

  const rateLimitResponse = await withRateLimit(request, 'waitlist');
  if (rateLimitResponse) return rateLimitResponse;

  const parsed = NoticeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw createError.validation('Invalid copyright notice', parsed.error.flatten());
  }
  const notice = parsed.data;

  const token = normalizeToken(notice.contentUrl);
  if (!token) {
    throw createError.badRequest(
      'That is not a shared conversation or published artifact URL from this site',
    );
  }

  const target = await findPublicTarget(getNeonDb(), token);
  if (!target) {
    throw createError.notFound('Nothing is published at that URL any more');
  }

  let reporterUserId: string | null = null;
  try {
    reporterUserId = (await getRequestIdentity()).subject ?? null;
  } catch {
    reporterUserId = null;
  }

  const reference = generateReference();

  await recordCopyrightNotice(getNeonDb(), {
    reference,
    reporterName: notice.reporterName,
    reporterEmail: notice.reporterEmail,
    reporterOrganization: notice.rightsHolder ?? null,
    targetKind: target.kind,
    targetToken: target.token,
    targetOwnerId: target.ownerId,
    workDescription: notice.workDescription,
    statement: notice.signature,
  });

  await logSecurityEvent({
    userId: reporterUserId ?? undefined,
    eventType: 'content_notice',
    severity: 'high',
    ipAddress: getClientIp(request),
    userAgent: request.headers.get('user-agent') ?? undefined,
    endpoint: '/api/copyright-notice',
    details: {
      action: 'copyright_notice_received',
      reference,
      kind: target.kind,
      token: target.token,
      ownerId: target.ownerId,
      reporterEmail: notice.reporterEmail,
      reporterName: notice.reporterName,
      workDescription: notice.workDescription,
    },
  });

  const operatorNotified = await alertOperators({
    reference,
    notice,
    target,
    reporterUserId,
  }).catch((error) => {
    logger.error(
      { error, event: 'copyright_notice_alert_failed', reference },
      'Copyright notice was recorded but the operator alert threw',
    );
    return false;
  });

  return NextResponse.json({
    reference,
    kind: target.kind,
    operatorNotified,
  });
}

export const POST = withErrorHandler(handleNotice);
