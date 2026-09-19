export const PRIVATE_NO_STORE = 'private, no-store';

export const SENSITIVE_NO_STORE_ROUTE_FILES = [
  'app/api/me/route.ts',
  'app/api/me/routing-preferences/route.ts',
  'app/api/csrf/route.ts',
  'app/api/settings/preferences/route.ts',
  'app/api/settings/sessions/route.ts',
  'app/api/settings/activity/route.ts',
  'app/api/settings/audit-logs/actions/route.ts',
  'app/api/settings/audit-logs/route.ts',
  'app/api/settings/devices/route.ts',
  'app/api/settings/team/invitations/route.ts',
  'app/api/settings/team/route.ts',
  'app/api/settings/2fa/route.ts',
  'app/api/settings/organization/admin-api-keys/route.ts',
  'app/api/settings/organization/audit/route.ts',
  'app/api/settings/organization/billing-contract/route.ts',
  'app/api/settings/organization/connector-policy/route.ts',
  'app/api/settings/organization/groups/route.ts',
  'app/api/settings/organization/legal-holds/route.ts',
  'app/api/settings/organization/mcp/route.ts',
  'app/api/settings/organization/model-policy/route.ts',
  'app/api/settings/organization/policy/code/route.ts',
  'app/api/settings/organization/policy/overrides/route.ts',
  'app/api/settings/organization/policy/route.ts',
  'app/api/settings/organization/posture/route.ts',
  'app/api/settings/organization/retention/route.ts',
  'app/api/settings/organization/roles/route.ts',
  'app/api/settings/organization/route.ts',
  'app/api/settings/organization/shared/route.ts',
  'app/api/settings/organization/spend-limit/route.ts',
  'app/api/settings/organization/usage-analytics/route.ts',
  'app/api/user/data/route.ts',
  'app/api/user/delete-account/route.ts',
  'app/api/billing/credit-history/route.ts',
  'app/api/billing/invoices/route.ts',
  'app/api/billing/overage/route.ts',
  'app/api/billing/payment-methods/route.ts',
  'app/api/usage/route.ts',
  'app/api/projects/[id]/knowledge-files/route.ts',
  'app/api/projects/[id]/route.ts',
  'app/api/projects/route.ts',
  'app/api/projects/sync/route.ts',
  'app/api/chat/conversations/[id]/branches/route.ts',
  'app/api/chat/conversations/[id]/messages/route.ts',
  'app/api/chat/conversations/[id]/route.ts',
  'app/api/chat/conversations/route.ts',
  'app/api/connectors/[connectorId]/accounts/route.ts',
  'app/api/connectors/calls/route.ts',
  'app/api/connectors/custom/route.ts',
  'app/api/connectors/health/route.ts',
  'app/api/connectors/oauth/callback/route.ts',
  'app/api/connectors/oauth/start/route.ts',
  'app/api/connectors/permissions/route.ts',
  'app/api/connectors/route.ts',
  'app/api/github/installations/route.ts',
] as const;

function routeFilePattern(file: string): RegExp {
  const route = file.slice('app'.length, -'/route.ts'.length);
  const source = route
    .split('/')
    .map((segment) => {
      if (/^\[\.\.\..+\]$/.test(segment)) return '.+';
      if (/^\[.+\]$/.test(segment)) return '[^/]+';
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return new RegExp(`^${source}/?$`);
}

const SENSITIVE_NO_STORE_PATHS = SENSITIVE_NO_STORE_ROUTE_FILES.map(routeFilePattern);

export function isSensitiveNoStorePath(pathname: string): boolean {
  return SENSITIVE_NO_STORE_PATHS.some((pattern) => pattern.test(pathname));
}

function hasRequestCredentials(request: unknown): boolean {
  const headers = (request as { headers?: Headers } | null | undefined)?.headers;
  if (!headers || typeof headers.get !== 'function') return false;
  return Boolean(headers.get('authorization') || headers.get('cookie'));
}

export function applySensitiveNoStore(request: unknown, response: Response): void {
  if (response.headers.has('Cache-Control')) return;
  const rawUrl = (request as { url?: unknown } | null | undefined)?.url;
  if (typeof rawUrl !== 'string') return;
  let pathname: string;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    return;
  }
  if (isSensitiveNoStorePath(pathname) || hasRequestCredentials(request)) {
    response.headers.set('Cache-Control', PRIVATE_NO_STORE);
  }
}

export function withPrivateNoStore<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response> | Response,
) {
  return async (...args: TArgs): Promise<Response> => {
    const response = await handler(...args);
    response.headers.set('Cache-Control', PRIVATE_NO_STORE);
    return response;
  };
}
