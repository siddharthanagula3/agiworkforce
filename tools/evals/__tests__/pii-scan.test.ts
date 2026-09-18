import { describe, expect, it } from 'vitest';

import { scanDatasets, scanText } from '../scripts/pii-scan.mjs';

describe('the dataset PII scan', () => {
  it('finds the patterns that mean a row came from a real person', () => {
    const kinds = (text: string) => scanText(text).map((finding) => finding.kind);

    expect(kinds('write to priya.sharma@northwind-logistics.co.uk about the order')).toEqual([
      'email',
    ]);
    expect(kinds('the claimant SSN is 123-45-6789')).toEqual(['government-id']);
    expect(kinds('call the customer on +14155552671')).toEqual(['phone']);
    expect(kinds('reach her at (415) 555-2671 tomorrow')).toEqual(['phone']);
    expect(kinds('charged to 4111 1111 1111 1111 on the 4th')).toEqual(['payment-card']);
    expect(kinds('the request came from 52.94.236.248')).toEqual(['ip-address']);
    expect(kinds('settle to GB29NWBK60161331926819 by Friday')).toEqual(['bank-account']);
    expect(kinds('the key sk_live_abcdef123456 was rotated')).toEqual(['credential']);
  });

  it('redacts what it found, so the failure does not reprint the data', () => {
    const [finding] = scanText('the claimant SSN is 123-45-6789');

    expect(finding?.redacted).toBe('12*******89');
    expect(finding?.redacted).not.toContain('345');
    expect(finding?.line).toBe(1);
  });

  it('allows the reserved documentation names a synthetic row is written with', () => {
    expect(scanText('mail dana@example.com and ana@example.org')).toEqual([]);
    expect(scanText('the host was 192.0.2.44, then 198.51.100.7')).toEqual([]);
    expect(scanText('see https://docs.acmecloud.example/security/rotate-keys')).toEqual([]);
  });

  it('does not mistake dates, prices or figures for personal data', () => {
    expect(scanText('issued 2026-03-04, due 2026-04-03, total 1275.00 USD')).toEqual([]);
    expect(scanText('Harbourline opened 1240 charging points, up from 810')).toEqual([]);
    expect(scanText('plans start at $9 per month for 10,000 messages')).toEqual([]);
  });

  it('reports the file and line so a failing row can be found', () => {
    const findings = scanText('clean line\nmail rex@northwind-logistics.co.uk\n');

    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(2);
  });

  it('passes over every committed corpus and fixture', () => {
    expect(scanDatasets()).toEqual([]);
  });
});
