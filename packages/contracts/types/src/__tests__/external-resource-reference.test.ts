import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_RESOURCE_LIMITS,
  externalResourceIdentityKey,
  normalizeExternalResourceReference,
  parseRepositoryUrl,
  type ExternalResourceReferenceInput,
} from '../external-resource-reference';

const base: ExternalResourceReferenceInput = {
  kind: 'web_page',
  provider: 'fixture',
  uri: 'https://fixture.invalid/document#section',
  access: 'public',
};

describe('external resource identities', () => {
  it('unifies repository transport spellings and strips only repository navigation tails', () => {
    expect(parseRepositoryUrl('git@github.com:Owner/Repo.git')).toEqual({
      host: 'github.com',
      path: 'Owner/Repo',
    });
    expect(parseRepositoryUrl('https://www.github.com/Owner/Repo/tree/main')).toEqual({
      host: 'github.com',
      path: 'Owner/Repo',
    });
    expect(parseRepositoryUrl('ssh://git@fixture.invalid/group/subgroup/Repo.git')).toEqual({
      host: 'fixture.invalid',
      path: 'group/subgroup/Repo',
    });
    expect(
      externalResourceIdentityKey({
        ...base,
        kind: 'repository',
        uri: 'https://github.com/Owner/Repo.git',
      }),
    ).toBe('repository:github.com/owner/repo');
    for (const uri of [
      'not a URL',
      'file:///Owner/Repo',
      'https://fixture.invalid/only',
      'git@fixture.invalid:only',
      'https://fixture.invalid/group/.git',
    ])
      expect(parseRepositoryUrl(uri)).toBeNull();
  });

  it('keeps server query identity but removes fragments and trailing path separators', () => {
    expect(
      externalResourceIdentityKey({
        ...base,
        kind: 'mcp_server',
        uri: 'https://FIXTURE.invalid/mcp///?version=1#fragment',
      }),
    ).toBe('mcp_server:https://fixture.invalid/mcp?version=1');
    expect(
      externalResourceIdentityKey({ ...base, kind: 'mcp_server', uri: 'https://fixture.invalid/' }),
    ).toBe('mcp_server:https://fixture.invalid');
    expect(
      externalResourceIdentityKey({ ...base, kind: 'mcp_server', uri: 'file:///mcp' }),
    ).toBeNull();
    expect(externalResourceIdentityKey({ ...base, kind: 'mcp_server', uri: 'invalid' })).toBeNull();
    expect(
      externalResourceIdentityKey({
        ...base,
        kind: 'connector_item',
        provider: ' FIXTURE ',
        externalId: ' document-1 ',
      }),
    ).toBe('connector_item:fixture:document-1');
    expect(
      externalResourceIdentityKey({ ...base, kind: 'connector_item', externalId: ' ' }),
    ).toBeNull();
  });

  it('retains connector account provenance and normalized version without granting public access', () => {
    expect(
      normalizeExternalResourceReference({
        ...base,
        kind: 'connector_item',
        provider: ' FIXTURE ',
        connectorId: ' connection-1 ',
        accountKey: ' account-1 ',
        access: 'connector',
        externalId: ' document-1 ',
        title: ' Title ',
        version: { kind: 'revision', value: ' 5 ' },
      }),
    ).toEqual({
      ok: true,
      reference: {
        kind: 'connector_item',
        provider: 'fixture',
        identityKey: 'connector_item:fixture:document-1',
        uri: 'https://fixture.invalid/document',
        access: 'connector',
        connectorId: 'connection-1',
        accountKey: 'account-1',
        externalId: 'document-1',
        title: 'Title',
        version: { kind: 'revision', value: '5' },
      },
    });
    expect(normalizeExternalResourceReference({ ...base, access: 'connector' })).toEqual({
      ok: false,
      reason: 'connector access names no connector',
    });
    expect(
      normalizeExternalResourceReference({
        ...base,
        title: 'x'.repeat(EXTERNAL_RESOURCE_LIMITS.title + 1),
        version: { kind: 'revision', value: ' ' },
      }),
    ).toMatchObject({
      ok: true,
      reference: {
        title: 'x'.repeat(EXTERNAL_RESOURCE_LIMITS.title),
        version: null,
        externalId: null,
        accountKey: null,
      },
    });
    expect(
      normalizeExternalResourceReference({
        ...base,
        kind: 'repository',
        uri: 'git@github.com:Owner/Repo.git',
      }),
    ).toMatchObject({ ok: true, reference: { uri: 'https://github.com/Owner/Repo' } });
  });

  it.each([
    [{ kind: 'unknown' }, 'unknown kind'],
    [{ provider: '../fixture' }, 'invalid provider'],
    [{ access: 'authorized' }, 'unknown access'],
    [{ uri: 'file:///document' }, 'invalid uri'],
    [{ uri: 'invalid' }, 'invalid uri'],
    [{ uri: 'https://fixture.invalid/' + 'x'.repeat(EXTERNAL_RESOURCE_LIMITS.uri) }, 'invalid uri'],
    [{ kind: 'connector_item', externalId: '' }, 'no identity'],
    [{ externalId: 'x'.repeat(EXTERNAL_RESOURCE_LIMITS.externalId + 1) }, 'value too long'],
    [{ connectorId: 'x'.repeat(EXTERNAL_RESOURCE_LIMITS.connectorId + 1) }, 'value too long'],
    [{ accountKey: 'x'.repeat(EXTERNAL_RESOURCE_LIMITS.accountKey + 1) }, 'value too long'],
    [
      { version: { kind: 'revision', value: 'x'.repeat(EXTERNAL_RESOURCE_LIMITS.version + 1) } },
      'value too long',
    ],
  ])('refuses invalid resource input %#', (patch, reason) => {
    expect(
      normalizeExternalResourceReference({ ...base, ...patch } as ExternalResourceReferenceInput),
    ).toEqual({ ok: false, reason });
  });
});
