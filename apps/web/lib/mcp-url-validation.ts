import 'server-only';

import { createError } from '@/lib/errors';
import { assertResolvedPublicHostname, EgressPolicyError } from '@/lib/egress-policy';

/**
 * Validate a user-supplied remote MCP server URL: https-only, DNS-resolved
 * public hostname (SSRF defense-in-depth against internal/private targets),
 * and no embedded credentials.
 *
 * Shared by `/api/mcp` (one-off inspect) and `/api/connectors/custom`
 * (persisted custom connectors) so both entry points enforce identical
 * egress rules. `fieldLabel` only affects error text (kept as `config.url`
 * for /api/mcp callers to preserve their existing error messages).
 */
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
