import { describe, expect, it } from 'vitest';
import {
  CHINESE_HQ_PROVIDER_IDS,
  CHINESE_HQ_PROVIDER_NOT_OPTED_IN_CODE,
  ChineseHqProviderNotOptedInError,
  NON_US_VENDOR_TRANSPORT_DEPLOYMENTS,
  chineseHqProviderDisplayName,
  composeFreeModelProviderNotice,
  hasFreeModelProviderNotice,
  isNamedProviderConsentCurrent,
  isNonUsVendorTransport,
  namedProviderConsentRecord,
  nonUsVendorTransportDeployment,
} from '../index';

const NOW = new Date('2026-10-05T09:00:00.000Z');
const NOTICE_PROVIDER_IDS = CHINESE_HQ_PROVIDER_IDS.filter(hasFreeModelProviderNotice);

describe('the free model provider notice', () => {
  it('names the provider from the repository list and says it is China-headquartered', () => {
    expect(NOTICE_PROVIDER_IDS).toContain('qwen');
    for (const id of NOTICE_PROVIDER_IDS) {
      const notice = composeFreeModelProviderNotice(id);
      const name = chineseHqProviderDisplayName(id);

      expect(notice.providerName).toBe(name);
      expect(notice.title).toContain(name);
      expect(notice.statements[0]).toContain(`${name} is a China-headquartered AI provider`);
    }
  });

  it('says where requests enter and where the model may run, from the residency record', () => {
    const record = NON_US_VENDOR_TRANSPORT_DEPLOYMENTS.qwen;

    expect(composeFreeModelProviderNotice('qwen').statements[1]).toBe(
      `Requests for these free models go to its ${record.accessRegion} region. The provider says the model may run on its servers ${record.inferenceScope}.`,
    );
  });

  it('does not place the computation in one country or outside the United States', () => {
    for (const id of NOTICE_PROVIDER_IDS) {
      const where = composeFreeModelProviderNotice(id).statements[1];

      expect(where).not.toMatch(/served from|outside the United States|only in|stays in/i);
    }
  });

  it('carries the vendor page and the day it was read for every recorded deployment', () => {
    for (const record of Object.values(NON_US_VENDOR_TRANSPORT_DEPLOYMENTS)) {
      expect(record.source).toMatch(/^https:\/\//);
      expect(record.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(record.vendorScopeLabel.length).toBeGreaterThan(0);
      expect(record.accessRegion.length).toBeGreaterThan(0);
      expect(record.storageRegion.length).toBeGreaterThan(0);
      expect(record.inferenceScope.length).toBeGreaterThan(0);
    }
  });

  it('exists only for a named provider whose deployment the residency record names', () => {
    for (const id of CHINESE_HQ_PROVIDER_IDS) {
      expect(hasFreeModelProviderNotice(id), id).toBe(nonUsVendorTransportDeployment(id) !== null);
    }
    expect(nonUsVendorTransportDeployment('zhipu')).toBeNull();
    expect(nonUsVendorTransportDeployment('toString')).toBeNull();
    expect(nonUsVendorTransportDeployment('constructor')).toBeNull();
    expect(hasFreeModelProviderNotice('zhipu')).toBe(false);
    expect(hasFreeModelProviderNotice('openai')).toBe(false);
    expect(hasFreeModelProviderNotice('toString')).toBe(false);
  });

  it('never says where requests go without a recorded deployment to name', () => {
    for (const id of NOTICE_PROVIDER_IDS) {
      const where = composeFreeModelProviderNotice(id).statements[1];

      expect(where).toContain(` ${NON_US_VENDOR_TRANSPORT_DEPLOYMENTS[id].accessRegion} region`);
      expect(where).not.toMatch(/own endpoint/);
    }
  });

  it('records a deployment only for a transport the residency list places outside the United States', () => {
    for (const transport of Object.keys(NON_US_VENDOR_TRANSPORT_DEPLOYMENTS)) {
      expect(isNonUsVendorTransport(transport), transport).toBe(true);
    }
  });

  it('says what is sent, that the offer is limited, and where it is turned off', () => {
    const text = composeFreeModelProviderNotice('qwen').statements.join('\n');

    for (const fact of [
      "this chat's messages and images",
      'custom instructions',
      'the name, description and instructions of the project the chat is in',
      'saved memories and past-chat excerpts used for the reply',
      'A temporary chat sends no memories or past-chat excerpts',
      'limited free offer',
      'Settings, Privacy',
    ]) {
      expect(text, fact).toContain(fact);
    }
  });

  it('says nothing about how the provider trains on or keeps what it is sent', () => {
    for (const id of NOTICE_PROVIDER_IDS) {
      const notice = composeFreeModelProviderNotice(id);
      const text = [notice.title, ...notice.statements, notice.settingDescription].join('\n');

      expect(text).not.toMatch(/train|retain|retention|stor(e|ed|es|age)\b|delete/i);
    }
  });

  it('links the Privacy Policy and the provider list and carries no em dash', () => {
    const notice = composeFreeModelProviderNotice('qwen');

    expect(notice.links).toEqual([
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Provider list', href: '/subprocessors' },
    ]);
    // em-dash-allow: the character this assertion forbids in the notice
    expect(JSON.stringify(notice)).not.toContain('\u2014');
  });

  it('gives each provider its own version, stable between calls', () => {
    const versions = NOTICE_PROVIDER_IDS.map((id) => composeFreeModelProviderNotice(id).version);

    expect(new Set(versions).size).toBe(NOTICE_PROVIDER_IDS.length);
    expect(composeFreeModelProviderNotice('qwen').version).toBe(
      versions[NOTICE_PROVIDER_IDS.indexOf('qwen')],
    );
    expect(versions.every((version) => /^fnv-[0-9a-f]{16}$/.test(version))).toBe(true);
  });
});

describe('a named provider agreement', () => {
  const notice = composeFreeModelProviderNotice('qwen');

  it('is current only when accepted for this provider and this wording', () => {
    const accepted = namedProviderConsentRecord({
      notice,
      accepted: true,
      surface: 'web',
      now: NOW,
    });

    expect(accepted).toEqual({
      providerId: 'qwen',
      accepted: true,
      acceptedAt: NOW.toISOString(),
      disclosureVersion: notice.version,
      surface: 'web',
    });
    expect(isNamedProviderConsentCurrent(accepted, notice)).toBe(true);
    expect(isNamedProviderConsentCurrent(null, notice)).toBe(false);
    expect(isNamedProviderConsentCurrent({ ...accepted, accepted: false }, notice)).toBe(false);
    expect(isNamedProviderConsentCurrent({ ...accepted, providerId: 'deepseek' }, notice)).toBe(
      false,
    );
    expect(
      isNamedProviderConsentCurrent(
        { ...accepted, disclosureVersion: 'fnv-0000000000000000' },
        notice,
      ),
    ).toBe(false);
  });

  it('is refused with the code the provider gate already throws', () => {
    expect(new ChineseHqProviderNotOptedInError('qwen').code).toBe(
      CHINESE_HQ_PROVIDER_NOT_OPTED_IN_CODE,
    );
    expect(CHINESE_HQ_PROVIDER_NOT_OPTED_IN_CODE).toBe('cn_hq_provider_not_opted_in');
  });
});
