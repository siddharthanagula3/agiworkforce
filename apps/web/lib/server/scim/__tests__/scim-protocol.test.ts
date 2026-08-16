import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  coerceScimBoolean,
  parseScimGroupFilter,
  parseScimPagination,
  parseScimPatch,
  parseScimUserFilter,
  scimError,
  scimListResponse,
  scimServiceProviderConfig,
  ScimError,
  SCIM_MAX_PAGE_SIZE,
  SCIM_SCHEMA,
} from '../scim-protocol';

function params(query: string): URLSearchParams {
  return new URL(`https://example.com/Users?${query}`).searchParams;
}

describe('SCIM filter parsing', () => {
  it('parses the existence probe every IdP sends before a create', () => {
    expect(parseScimUserFilter('userName eq "ada@example.com"')).toEqual({
      attribute: 'userName',
      operator: 'eq',
      value: 'ada@example.com',
    });
  });

  it('accepts the allowlisted user attributes case-insensitively', () => {
    expect(parseScimUserFilter('externalid eq "okta-1"')?.attribute).toBe('externalId');
    expect(parseScimUserFilter('emails.value eq "ada@example.com"')?.attribute).toBe(
      'emails.value',
    );
    expect(parseScimGroupFilter('displayName eq "Engineers"')?.attribute).toBe('displayName');
  });

  it('returns null when no filter is supplied', () => {
    expect(parseScimUserFilter(null)).toBeNull();
    expect(parseScimUserFilter('   ')).toBeNull();
  });

  it('refuses operators outside the supported subset instead of guessing', () => {
    expect(() => parseScimUserFilter('userName co "ada"')).toThrowError(ScimError);
    try {
      parseScimUserFilter('userName co "ada"');
    } catch (error) {
      expect((error as ScimError).status).toBe(400);
      expect((error as ScimError).scimType).toBe('invalidFilter');
    }
  });

  it('refuses attributes outside the allowlist, which is what keeps SQL out of reach', () => {
    expect(() => parseScimUserFilter('linked_user_id eq "someone-else"')).toThrowError(ScimError);
    expect(() => parseScimGroupFilter('userName eq "ada@example.com"')).toThrowError(ScimError);
  });

  it('refuses a compound filter rather than silently honouring only the first clause', () => {
    expect(() =>
      parseScimUserFilter('userName eq "ada@example.com" and active eq "true"'),
    ).toThrowError(ScimError);
  });

  it('never lets a quoted value carry SQL out of the parser', () => {
    const filter = parseScimUserFilter('userName eq "\\" or 1=1 --"');
    expect(filter).toEqual({ attribute: 'userName', operator: 'eq', value: '" or 1=1 --' });
  });

  it('caps filter length so a huge filter cannot be buffered', () => {
    expect(() => parseScimUserFilter(`userName eq "${'a'.repeat(600)}"`)).toThrowError(ScimError);
  });
});

describe('SCIM pagination', () => {
  it('defaults to the 1-based first page', () => {
    expect(parseScimPagination(params(''))).toEqual({ startIndex: 1, count: 100, offset: 0 });
  });

  it('translates a 1-based startIndex into a 0-based offset', () => {
    expect(parseScimPagination(params('startIndex=51&count=25'))).toEqual({
      startIndex: 51,
      count: 25,
      offset: 50,
    });
  });

  it('clamps startIndex below 1 per RFC 7644 rather than rejecting it', () => {
    expect(parseScimPagination(params('startIndex=0')).startIndex).toBe(1);
    expect(parseScimPagination(params('startIndex=-5')).startIndex).toBe(1);
  });

  it('caps count so an IdP cannot request the whole directory at once', () => {
    expect(parseScimPagination(params('count=100000')).count).toBe(SCIM_MAX_PAGE_SIZE);
    expect(parseScimPagination(params('count=0')).count).toBe(0);
  });

  it('rejects a non-integer page parameter', () => {
    expect(() => parseScimPagination(params('count=abc'))).toThrowError(ScimError);
    expect(() => parseScimPagination(params('startIndex=1.5'))).toThrowError(ScimError);
  });

  it('reports itemsPerPage as the page actually returned, not the requested count', () => {
    const pagination = parseScimPagination(params('count=50'));
    const body = scimListResponse([{ id: 'a' }, { id: 'b' }], 97, pagination);
    expect(body).toMatchObject({
      schemas: [SCIM_SCHEMA.listResponse],
      totalResults: 97,
      startIndex: 1,
      itemsPerPage: 2,
    });
  });
});

describe('SCIM PATCH parsing', () => {
  const patchSchemas = [SCIM_SCHEMA.patchOp];

  it("parses Okta's deprovision shape", () => {
    expect(
      parseScimPatch({
        schemas: patchSchemas,
        Operations: [{ op: 'replace', path: 'active', value: false }],
      }),
    ).toEqual([{ op: 'replace', path: 'active', value: false }]);
  });

  it("parses Entra's path-less shape", () => {
    expect(
      parseScimPatch({
        schemas: patchSchemas,
        Operations: [{ op: 'Replace', value: { active: false } }],
      }),
    ).toEqual([{ op: 'replace', value: { active: false } }]);
  });

  it('requires the PatchOp schema so an arbitrary JSON body cannot mutate a user', () => {
    expect(() => parseScimPatch({ Operations: [{ op: 'replace', value: {} }] })).toThrowError(
      ScimError,
    );
  });

  it('rejects an empty, missing or non-array Operations list', () => {
    expect(() => parseScimPatch({ schemas: patchSchemas })).toThrowError(ScimError);
    expect(() => parseScimPatch({ schemas: patchSchemas, Operations: [] })).toThrowError(ScimError);
    expect(() => parseScimPatch({ schemas: patchSchemas, Operations: {} })).toThrowError(ScimError);
  });

  it('rejects an unknown op instead of treating it as a no-op', () => {
    expect(() =>
      parseScimPatch({ schemas: patchSchemas, Operations: [{ op: 'delete', path: 'active' }] }),
    ).toThrowError(ScimError);
  });

  it('bounds the operation count', () => {
    const operations = new Array(101).fill({ op: 'replace', path: 'active', value: false });
    expect(() => parseScimPatch({ schemas: patchSchemas, Operations: operations })).toThrowError(
      ScimError,
    );
  });

  it('rejects a non-object body', () => {
    expect(() => parseScimPatch('nope')).toThrowError(ScimError);
    expect(() => parseScimPatch([{ op: 'replace' }])).toThrowError(ScimError);
    expect(() => parseScimPatch(null)).toThrowError(ScimError);
  });
});

describe('SCIM boolean coercion', () => {
  it('accepts both the boolean and the stringified forms IdPs send', () => {
    expect(coerceScimBoolean(false, 'active')).toBe(false);
    expect(coerceScimBoolean('False', 'active')).toBe(false);
    expect(coerceScimBoolean('true', 'active')).toBe(true);
  });

  it('refuses anything else rather than defaulting — a silently ignored deprovision is the worst outcome', () => {
    expect(() => coerceScimBoolean('no', 'active')).toThrowError(ScimError);
    expect(() => coerceScimBoolean(0, 'active')).toThrowError(ScimError);
    expect(() => coerceScimBoolean(undefined, 'active')).toThrowError(ScimError);
  });
});

describe('SCIM responses', () => {
  it('always answers with application/scim+json and no caching', async () => {
    const response = scimError(404, 'User not found');
    expect(response.headers.get('content-type')).toBe('application/scim+json');
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      schemas: [SCIM_SCHEMA.error],
      status: '404',
      detail: 'User not found',
    });
  });

  it('attaches a WWW-Authenticate challenge to a 401', () => {
    expect(scimError(401, 'nope').headers.get('www-authenticate')).toBe('Bearer realm="scim"');
  });

  it('advertises only capabilities that are genuinely implemented', () => {
    const config = scimServiceProviderConfig('https://example.com/api/scim/v2');
    expect(config.patch.supported).toBe(true);
    expect(config.filter.supported).toBe(true);
    expect(config.bulk.supported).toBe(false);
    expect(config.sort.supported).toBe(false);
    expect(config.etag.supported).toBe(false);
    expect(config.authenticationSchemes[0]?.type).toBe('oauthbearertoken');
  });
});
