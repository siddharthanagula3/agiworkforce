import { CONCEPT_NAMES } from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';

import {
  RESOURCE_URI_KINDS,
  formatResourceUri,
  isCanonicalResourceId,
  parseResourceUri,
  resourceUriFor,
} from '../resource-uri';

const UUID = '2f1c8a64-9d3b-4f7a-8e21-0b5d6c7a8f90';

describe('resource uri', () => {
  it('takes its kinds from the concept registry', () => {
    expect(RESOURCE_URI_KINDS).toEqual(CONCEPT_NAMES);
  });

  it('round-trips every registered kind', () => {
    for (const kind of RESOURCE_URI_KINDS) {
      const uri = formatResourceUri({ kind, id: UUID });
      expect(uri).toBe(`agi://${kind}/${UUID}`);
      expect(parseResourceUri(uri)).toEqual({ kind, id: UUID });
    }
  });

  it('carries the workspace and the view when they are given', () => {
    const uri = formatResourceUri({
      kind: 'conversation',
      id: UUID,
      workspaceId: 'ws_01',
      view: 'messages',
    });
    expect(parseResourceUri(uri)).toEqual({
      kind: 'conversation',
      id: UUID,
      workspaceId: 'ws_01',
      view: 'messages',
    });
  });

  it('refuses a kind no concept declares', () => {
    expect(parseResourceUri(`agi://invoice/${UUID}`)).toBeNull();
    expect(() =>
      formatResourceUri({ kind: 'invoice' as (typeof RESOURCE_URI_KINDS)[number], id: UUID }),
    ).toThrow(/not a concept in the registry/);
  });

  it('refuses a provider task id as a canonical address', () => {
    expect(isCanonicalResourceId(UUID)).toBe(true);
    expect(isCanonicalResourceId('op_0123456789abcdef')).toBe(true);
    expect(isCanonicalResourceId('projects/1234/operations/abc')).toBe(false);
    expect(isCanonicalResourceId('chatcmpl-9xQdE1t')).toBe(false);
    expect(() => formatResourceUri({ kind: 'artifact', id: 'chatcmpl-9xQdE1t' })).toThrow(
      /canonical AGI id/,
    );
    expect(parseResourceUri('agi://artifact/chatcmpl-9xQdE1t')).toBeNull();
  });

  it('answers null for a pair no canonical address covers, instead of throwing', () => {
    expect(resourceUriFor({ kind: 'project', id: UUID })).toBe(`agi://project/${UUID}`);
    expect(resourceUriFor({ kind: 'project', id: UUID, workspaceId: 'ws_01' })).toBe(
      `agi://project/${UUID}?workspace=ws_01`,
    );
    expect(resourceUriFor({ kind: 'legal_hold', id: UUID })).toBeNull();
    expect(resourceUriFor({ kind: 'project', id: 'chatcmpl-9xQdE1t' })).toBeNull();
    expect(resourceUriFor({ kind: 'project', id: null })).toBeNull();
  });

  it('refuses another scheme, a nested path and a malformed value', () => {
    expect(parseResourceUri(`https://example.com/conversation/${UUID}`)).toBeNull();
    expect(parseResourceUri(`agi://conversation/nested/${UUID}`)).toBeNull();
    expect(parseResourceUri('agi://conversation/')).toBeNull();
    expect(parseResourceUri('not a uri')).toBeNull();
  });
});
