import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { PRODUCT_BRAND } from '@agiworkforce/types';

import { withErrorHandler } from '@/lib/error-handler';
import { escapeHtml } from '@/lib/html-escape';
import { logger } from '@/lib/logger';
import { withRateLimit } from '@/lib/rate-limit';
import {
  MARKETING_EMAIL_UNSUBSCRIBE_PATH,
  ONE_CLICK_UNSUBSCRIBE_POST,
  readMarketingEmailUnsubscribeToken,
  unsubscribeFromMarketingEmail,
} from '@/lib/services/billing-notice-service';

const PRIVACY_SETTINGS_PATH = '/settings/privacy';
const MAX_TOKEN_LENGTH = 2048;

const CONFIRM_HEADING = 'Unsubscribe from marketing email?';
const CONFIRM_BUTTON = 'Unsubscribe';
const UNSUBSCRIBED = 'You’re unsubscribed from marketing email.';
const EXPIRED_BEFORE_LINK = 'This link has expired. Turn off marketing email in ';
const EXPIRED_LINK_LABEL = 'Settings > Privacy';
const NOT_SAVED = 'That change was not saved. Try again.';

function page(body: string, status: number): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex"><title>${escapeHtml(PRODUCT_BRAND)}</title></head><body><main>${body}</main></body></html>`;
  return new NextResponse(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
    },
  });
}

function expiredPage(): NextResponse {
  return page(
    `<p>${escapeHtml(EXPIRED_BEFORE_LINK)}<a href="${PRIVACY_SETTINGS_PATH}">${escapeHtml(EXPIRED_LINK_LABEL)}</a>.</p>`,
    400,
  );
}

function tokenOf(request: NextRequest): string | null {
  const token = request.nextUrl.searchParams.get('token');
  return token && token.length <= MAX_TOKEN_LENGTH ? token : null;
}

async function handleConfirm(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const token = tokenOf(request);
  if (!readMarketingEmailUnsubscribeToken(token)) return expiredPage();

  const [field = '', value = ''] = ONE_CLICK_UNSUBSCRIBE_POST.split('=');
  const action = `${MARKETING_EMAIL_UNSUBSCRIBE_PATH}?token=${encodeURIComponent(token ?? '')}`;
  return page(
    `<h1>${escapeHtml(CONFIRM_HEADING)}</h1><form method="post" action="${escapeHtml(action)}"><input type="hidden" name="${escapeHtml(field)}" value="${escapeHtml(value)}"><button type="submit">${escapeHtml(CONFIRM_BUTTON)}</button></form>`,
    200,
  );
}

async function handleUnsubscribe(request: NextRequest): Promise<NextResponse> {
  const rateLimitResponse = await withRateLimit(request, 'default');
  if (rateLimitResponse) return rateLimitResponse;

  const form = await request.text().catch(() => '');
  if (new URLSearchParams(form).toString() !== ONE_CLICK_UNSUBSCRIBE_POST) {
    return page(`<p>${escapeHtml(NOT_SAVED)}</p>`, 400);
  }

  try {
    const outcome = await unsubscribeFromMarketingEmail(tokenOf(request));
    if (outcome === 'invalid') return expiredPage();
  } catch (error) {
    logger.error({ error }, 'Recording a marketing email unsubscribe failed');
    return page(`<p>${escapeHtml(NOT_SAVED)}</p>`, 503);
  }
  logger.info('Marketing email unsubscribe recorded from an email link');
  return page(`<p>${escapeHtml(UNSUBSCRIBED)}</p>`, 200);
}

export const GET = withErrorHandler(handleConfirm);
export const POST = withErrorHandler(handleUnsubscribe);
