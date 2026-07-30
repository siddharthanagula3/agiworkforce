export const API_KEY_SCOPE_VALUES = ['models:read', 'inference:write', 'usage:read'] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPE_VALUES)[number];

export const API_KEY_SCOPE_OPTIONS: ReadonlyArray<{
  value: ApiKeyScope;
  label: string;
  description: string;
}> = [
  {
    value: 'models:read',
    label: 'Read model catalog',
    description: 'List the models available to this account.',
  },
  {
    value: 'inference:write',
    label: 'Run inference',
    description: 'Create chat completions and audio transcriptions.',
  },
  {
    value: 'usage:read',
    label: 'Read usage',
    description: 'Read plan and managed-usage status.',
  },
];

const API_KEY_SCOPE_SET = new Set<string>(API_KEY_SCOPE_VALUES);

/**
 * Rows created before scoped issuance shipped contain an empty array. They are
 * treated as having every currently supported public-API scope, but the auth
 * boundary still rejects them on every non-public endpoint.
 */
export function resolveApiKeyScopes(scopes: readonly string[]): ApiKeyScope[] {
  if (scopes.length === 0) {
    return [...API_KEY_SCOPE_VALUES];
  }

  return scopes.filter((scope): scope is ApiKeyScope => API_KEY_SCOPE_SET.has(scope));
}

export function apiKeyHasScope(scopes: readonly string[], requiredScope: ApiKeyScope): boolean {
  return resolveApiKeyScopes(scopes).includes(requiredScope);
}
