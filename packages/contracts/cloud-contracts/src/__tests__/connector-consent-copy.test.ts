import { describe, expect, it } from 'vitest';
import {
  CONNECTOR_ACCESS_SENTENCES,
  CONNECTOR_CONSENT_ALLOW,
  CONNECTOR_CONSENT_DENY,
  CONNECTOR_CONSENT_HEADING,
  CONNECTOR_CONSENT_POINTS,
  DISCOVERED_CONNECTOR_ACCESS_SENTENCE,
  connectorAccessSentence,
  connectorConsentTitle,
  connectorRiskClass,
} from '../index';

describe('connector consent copy', () => {
  it('names the connector in the consent question and offers Allow and Deny', () => {
    expect(connectorConsentTitle('Gmail')).toBe('Connect Gmail?');
    expect([CONNECTOR_CONSENT_ALLOW, CONNECTOR_CONSENT_DENY]).toEqual(['Allow', 'Deny']);
    expect(CONNECTOR_CONSENT_HEADING).toBe('Before you connect');
    expect(CONNECTOR_CONSENT_POINTS).toHaveLength(6);
  });

  it('states the access class, or how a discovered server lists its tools', () => {
    expect(connectorAccessSentence('read-only')).toBe(CONNECTOR_ACCESS_SENTENCES['read-only']);
    expect(connectorAccessSentence('high-impact')).toContain('sensitive data');
    expect(connectorAccessSentence(undefined)).toBe(DISCOVERED_CONNECTOR_ACCESS_SENTENCE);
  });

  it('reads a known connector risk class by id, never from an inherited name', () => {
    expect(connectorRiskClass('gmail')).toBe('read-write');
    expect(connectorRiskClass('google-contacts')).toBe('read-only');
    expect(connectorRiskClass('stripe')).toBe('high-impact');
    expect(connectorRiskClass('constructor')).toBeNull();
    expect(connectorRiskClass('unknown-server')).toBeNull();
    expect(connectorAccessSentence(connectorRiskClass('unknown-server'))).toBe(
      DISCOVERED_CONNECTOR_ACCESS_SENTENCE,
    );
  });
});
