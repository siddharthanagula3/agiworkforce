import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  DEPENDENCY_FAILOVERS,
  DEPENDENCY_KINDS,
  PRODUCT_CAPABILITIES,
  UPSTREAM_DEPENDENCIES,
  capabilitiesAffectedBy,
  getCapability,
  getUpstream,
  isDependencyKind,
  upstreamsFor,
} from '../dependency-registry';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../..');
const ENV_EXAMPLE = readFileSync(path.join(REPO_ROOT, 'apps/web/.env.example'), 'utf8');
const CODEOWNERS = readFileSync(path.join(REPO_ROOT, '.github/CODEOWNERS'), 'utf8');

describe('upstream dependencies', () => {
  it('names a module that exists', () => {
    for (const upstream of UPSTREAM_DEPENDENCIES) {
      expect(existsSync(path.join(REPO_ROOT, upstream.module)), upstream.id).toBe(true);
    }
  });

  it('names environment variables the example file declares', () => {
    for (const upstream of UPSTREAM_DEPENDENCIES) {
      expect(upstream.envVars.length, upstream.id).toBeGreaterThan(0);
      for (const name of upstream.envVars) {
        const declared = new RegExp(`^#?\\s*${name}=`, 'm').test(ENV_EXAMPLE);
        expect(declared, `${upstream.id} -> ${name}`).toBe(true);
      }
    }
  });

  it('names an owner CODEOWNERS routes to', () => {
    for (const upstream of UPSTREAM_DEPENDENCIES) {
      expect(CODEOWNERS.includes(upstream.owner), upstream.id).toBe(true);
    }
  });

  it('uses the declared vocabularies and unique ids', () => {
    const ids = UPSTREAM_DEPENDENCIES.map((upstream) => upstream.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const upstream of UPSTREAM_DEPENDENCIES) {
      expect(DEPENDENCY_KINDS, upstream.id).toContain(upstream.kind);
      expect(DEPENDENCY_FAILOVERS, upstream.id).toContain(upstream.failover);
      expect(isDependencyKind(upstream.kind)).toBe(true);
    }
  });

  it('states what fails, in a sentence, for every dependency', () => {
    for (const upstream of UPSTREAM_DEPENDENCIES) {
      expect(upstream.failureMode.length, upstream.id).toBeGreaterThan(40);
      expect(upstream.failureMode.trim().endsWith('.'), upstream.id).toBe(true);
    }
  });

  it('resolves a shared vendor to a dependency that exists', () => {
    for (const upstream of UPSTREAM_DEPENDENCIES) {
      if (upstream.sharesVendorWith === undefined) continue;
      expect(getUpstream(upstream.sharesVendorWith), upstream.id).not.toBeNull();
      expect(upstream.sharesVendorWith).not.toBe(upstream.id);
    }
  });

  it('tracks browser infrastructure apart from the sandbox it shares a vendor with', () => {
    const browser = getUpstream('browser-infrastructure');
    expect(browser?.kind).toBe('browser');
    expect(browser?.sharesVendorWith).toBe('e2b-sandbox');
    expect(getUpstream('e2b-sandbox')?.kind).toBe('sandbox');
  });
});

describe('product capabilities', () => {
  it('names a domain path that exists and an owner CODEOWNERS routes to', () => {
    for (const capability of PRODUCT_CAPABILITIES) {
      expect(existsSync(path.join(REPO_ROOT, capability.domainPath)), capability.id).toBe(true);
      expect(CODEOWNERS.includes(capability.owner), capability.id).toBe(true);
    }
  });

  it('declares at least one upstream, and every one resolves', () => {
    for (const capability of PRODUCT_CAPABILITIES) {
      expect(capability.upstreams.length, capability.id).toBeGreaterThan(0);
      expect(upstreamsFor(capability.id)).toHaveLength(capability.upstreams.length);
    }
  });

  it('has unique ids and is looked up by them', () => {
    const ids = PRODUCT_CAPABILITIES.map((capability) => capability.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getCapability('billing')?.label).toBe('Billing and credits');
    expect(getCapability('nothing')).toBeNull();
    expect(upstreamsFor('nothing')).toEqual([]);
  });

  it('answers what stops when one vendor does', () => {
    const affected = capabilitiesAffectedBy('e2b-sandbox').map((capability) => capability.id);
    expect(affected).toContain('code-execution');
    expect(capabilitiesAffectedBy('stripe').map((capability) => capability.id)).toEqual([
      'billing',
    ]);
    expect(capabilitiesAffectedBy('neon-postgres').length).toBeGreaterThan(4);
  });

  it('leaves no upstream nothing depends on', () => {
    for (const upstream of UPSTREAM_DEPENDENCIES) {
      expect(capabilitiesAffectedBy(upstream.id).length, upstream.id).toBeGreaterThan(0);
    }
  });
});
