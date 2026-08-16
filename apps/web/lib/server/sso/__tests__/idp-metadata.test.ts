import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  assertClaimableDomain,
  assertSafeAttributeMapping,
  assertSafeIdpUrl,
  assertSafeMetadataXml,
  IdpValidationError,
  isPrivateOrReservedHost,
} from '../idp-metadata';

describe('assertSafeIdpUrl', () => {
  it('accepts an https identity provider URL and returns it normalized', () => {
    expect(
      assertSafeIdpUrl('metadata_url', 'https://example.okta.com/app/abc/sso/saml/metadata'),
    ).toBe('https://example.okta.com/app/abc/sso/saml/metadata');
  });

  it.each([
    ['http', 'http://idp.example.com/metadata'],
    ['file', 'file:///etc/passwd'],
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:text/xml,<EntityDescriptor/>'],
    ['gopher', 'gopher://idp.example.com/metadata'],
  ])('rejects a %s URL', (_label, value) => {
    expect(() => assertSafeIdpUrl('metadata_url', value)).toThrow(IdpValidationError);
  });

  it.each([
    ['loopback name', 'https://localhost/metadata'],
    ['loopback address', 'https://127.0.0.1/metadata'],
    ['rfc1918 10/8', 'https://10.1.2.3/metadata'],
    ['rfc1918 172.16/12', 'https://172.20.0.5/metadata'],
    ['rfc1918 192.168/16', 'https://192.168.1.1/metadata'],
    ['cloud metadata service', 'https://169.254.169.254/latest/meta-data/'],
    ['gcp metadata name', 'https://metadata.google.internal/computeMetadata/v1/'],
    ['ipv6 loopback', 'https://[::1]/metadata'],
    ['ipv6 unique local', 'https://[fd00::1]/metadata'],
    ['ipv6 link local', 'https://[fe80::1]/metadata'],
    ['internal suffix', 'https://idp.internal/metadata'],
    ['mdns suffix', 'https://idp.local/metadata'],
    ['cgnat', 'https://100.64.3.9/metadata'],
  ])('rejects %s as an SSRF target', (_label, value) => {
    expect(() => assertSafeIdpUrl('metadata_url', value)).toThrow(/publicly resolvable/);
  });

  it('rejects embedded credentials', () => {
    expect(() => assertSafeIdpUrl('metadata_url', 'https://user:pass@idp.example.com/x')).toThrow(
      /must not embed credentials/,
    );
  });

  it('rejects a non-default port used to reach an internal service', () => {
    expect(() => assertSafeIdpUrl('metadata_url', 'https://idp.example.com:8500/metadata')).toThrow(
      /default https port/,
    );
  });

  it('reports the field that failed so the caller can fix the right input', () => {
    try {
      assertSafeIdpUrl('oidc_discovery_url', 'http://idp.example.com');
      expect.unreachable('expected a validation error');
    } catch (error) {
      expect(error).toBeInstanceOf(IdpValidationError);
      expect((error as IdpValidationError).field).toBe('oidc_discovery_url');
    }
  });
});

describe('isPrivateOrReservedHost', () => {
  it('treats routable public addresses as usable', () => {
    expect(isPrivateOrReservedHost('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedHost('example.okta.com')).toBe(false);
    expect(isPrivateOrReservedHost('172.32.0.1')).toBe(false);
  });

  it('catches an ipv4-mapped ipv6 loopback', () => {
    expect(isPrivateOrReservedHost('::ffff:127.0.0.1')).toBe(true);
  });
});

describe('assertClaimableDomain', () => {
  it('lowercases, trims and drops a trailing dot', () => {
    expect(assertClaimableDomain('  ExAmple.COM. ')).toBe('example.com');
  });

  it('accepts a multi-label corporate domain', () => {
    expect(assertClaimableDomain('corp.example.co.uk')).toBe('corp.example.co.uk');
  });

  it.each(['gmail.com', 'outlook.com', 'yahoo.co.uk', 'proton.me', 'icloud.com'])(
    'refuses to let %s be claimed',
    (domain) => {
      expect(() => assertClaimableDomain(domain)).toThrow(/public mailbox provider/);
    },
  );

  it.each(['localhost', 'example', 'exam ple.com', '-bad.com', 'a.b', '.com'])(
    'rejects %s as a malformed domain',
    (domain) => {
      expect(() => assertClaimableDomain(domain)).toThrow(IdpValidationError);
    },
  );
});

describe('assertSafeMetadataXml', () => {
  const valid =
    '<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="x"/>';

  it('accepts a plausible EntityDescriptor document', () => {
    expect(assertSafeMetadataXml(valid)).toBe(valid);
  });

  it('rejects a DOCTYPE declaration, which is how XXE and billion-laughs arrive', () => {
    expect(() =>
      assertSafeMetadataXml(
        '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><EntityDescriptor>&xxe;</EntityDescriptor>',
      ),
    ).toThrow(/DOCTYPE/);
  });

  it('rejects an entity declaration even without a DOCTYPE match', () => {
    expect(() =>
      assertSafeMetadataXml('<EntityDescriptor> <!ENTITY a "b"> </EntityDescriptor>'),
    ).toThrow(/entities/);
  });

  it('rejects a document that is not SAML metadata at all', () => {
    expect(() => assertSafeMetadataXml('<html><body>hello</body></html>')).toThrow(
      /EntityDescriptor/,
    );
  });

  it('rejects an oversized payload measured in bytes, not characters', () => {
    const oversized = `<EntityDescriptor>${'é'.repeat(260_000)}</EntityDescriptor>`;
    expect(oversized.length).toBeLessThan(500_000);
    expect(() => assertSafeMetadataXml(oversized)).toThrow(/at most 500000 bytes/);
  });

  it('rejects an empty document', () => {
    expect(() => assertSafeMetadataXml('   ')).toThrow(/must not be empty/);
  });
});

describe('assertSafeAttributeMapping', () => {
  it('passes through the four keys Clerk accepts', () => {
    expect(
      assertSafeAttributeMapping({
        userId: 'user.id',
        emailAddress: 'user.email',
        firstName: 'user.firstName',
        lastName: 'user.lastName',
      }),
    ).toEqual({
      userId: 'user.id',
      emailAddress: 'user.email',
      firstName: 'user.firstName',
      lastName: 'user.lastName',
    });
  });

  it('treats a missing mapping as empty', () => {
    expect(assertSafeAttributeMapping(undefined)).toEqual({});
    expect(assertSafeAttributeMapping(null)).toEqual({});
  });

  it('rejects an unknown key rather than silently dropping it', () => {
    expect(() => assertSafeAttributeMapping({ isAdmin: 'user.admin' })).toThrow(
      /key "isAdmin" is not supported/,
    );
  });

  it('rejects a prototype-pollution style key', () => {
    expect(() => assertSafeAttributeMapping(JSON.parse('{"__proto__":"x"}'))).toThrow(
      IdpValidationError,
    );
  });

  it('rejects an unbounded record', () => {
    const many: Record<string, string> = {};
    for (let i = 0; i < 50; i += 1) many[`k${i}`] = 'v';
    expect(() => assertSafeAttributeMapping(many)).toThrow(/at most 4 keys/);
  });

  it('rejects a non-string value', () => {
    expect(() => assertSafeAttributeMapping({ userId: 42 })).toThrow(/must be a string/);
  });

  it('rejects an over-long value', () => {
    expect(() => assertSafeAttributeMapping({ userId: 'a'.repeat(257) })).toThrow(
      /between 1 and 256 characters/,
    );
  });
});
