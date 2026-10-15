import { describe, expect, it } from 'vitest';
import { composeFreeModelProviderNotice } from '@agiworkforce/compliance';
import {
  NAMED_PROVIDER_CONSENT_NAMESPACE,
  freeModelProviderNotice,
  readNamedProviderConsent,
} from './named-provider-consent';

const RECORD = {
  providerId: 'qwen',
  accepted: true,
  acceptedAt: '2026-10-05T09:00:00.000Z',
  disclosureVersion: composeFreeModelProviderNotice('qwen').version,
  surface: 'web',
} as const;

describe('the stored agreement to a named provider', () => {
  it('lives in its own settings namespace, apart from the privacy toggles that are saved whole', () => {
    expect(NAMED_PROVIDER_CONSENT_NAMESPACE).toBe('provider_consent');
    expect(NAMED_PROVIDER_CONSENT_NAMESPACE).toMatch(/^[a-z][a-z0-9_-]{1,48}$/);
  });

  it('reads the record kept for the provider that was asked about', () => {
    expect(readNamedProviderConsent({ qwen: RECORD }, 'qwen')).toEqual(RECORD);
    expect(readNamedProviderConsent({ qwen: RECORD }, 'deepseek')).toBeNull();
  });

  it.each([
    ['no namespace', undefined],
    ['a namespace that is not an object', 'yes'],
    ['a list', [RECORD]],
    ['a bare true', { qwen: true }],
    ['a record filed under another provider', { qwen: { ...RECORD, providerId: 'deepseek' } }],
    ['an unknown provider', { qwen: { ...RECORD, providerId: 'someone-else' } }],
    ['an acceptance that is not a boolean', { qwen: { ...RECORD, accepted: 'true' } }],
    ['a time that is not a timestamp', { qwen: { ...RECORD, acceptedAt: 'yesterday' } }],
    ['no notice version', { qwen: { ...RECORD, disclosureVersion: '' } }],
    ['an unknown surface', { qwen: { ...RECORD, surface: 'kiosk' } }],
    ['a field the record does not have', { qwen: { ...RECORD, grantedBy: 'admin' } }],
  ])('reads %s as no agreement', (_label, namespace) => {
    expect(readNamedProviderConsent(namespace, 'qwen')).toBeNull();
  });

  it('has a notice only for a provider on the named list whose deployment is on record', () => {
    expect(freeModelProviderNotice('qwen')).toEqual(composeFreeModelProviderNotice('qwen'));
    expect(freeModelProviderNotice('zhipu')).toBeNull();
    expect(freeModelProviderNotice('experientiallabs')).toBeNull();
    expect(freeModelProviderNotice(null)).toBeNull();
  });
});
