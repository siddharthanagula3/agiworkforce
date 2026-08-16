import 'server-only';

import { createError } from '@/lib/errors';
import { assertResolvedPublicHostname, EgressPolicyError } from '@/lib/egress-policy';

export async function validateHttpsMcpUrl(raw: unknown, fieldLabel = 'url'): Promise<URL> {
  if (typeof raw !== 'string') {
    throw createError.validation(`${fieldLabel} must be a string`);
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw createError.validation(`${fieldLabel} is not a valid URL`);
  }
  if (parsed.protocol !== 'https:') {
    throw createError.validation(`${fieldLabel} must use https`);
  }
  try {
    await assertResolvedPublicHostname(parsed.toString());
  } catch (err) {
    if (err instanceof EgressPolicyError) {
      throw createError.validation(`${fieldLabel} targets a private or unsafe network address`);
    }
    throw err;
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw createError.validation(`${fieldLabel} must not include embedded credentials`);
  }
  return parsed;
}
