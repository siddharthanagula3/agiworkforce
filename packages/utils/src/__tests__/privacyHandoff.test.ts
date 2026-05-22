import { describe, expect, it } from 'vitest';
import { buildLocalToByokHandoffDraft, redactSecretsWithReport, scanSecrets } from '../index';

describe('privacy handoff utilities', () => {
  it('builds a clean Local to BYOK handoff draft with preview evidence', async () => {
    const result = await buildLocalToByokHandoffDraft({
      sourceSessionId: 'cli-session-1',
      sourceSurface: 'cli',
      targetSurface: 'desktop',
      createdAt: '2026-05-21T00:00:00.000Z',
      expiresAt: '2026-05-21T01:00:00.000Z',
      selectedContext: [
        {
          id: 'ctx-1',
          kind: 'message',
          label: 'last user prompt',
          content: 'Please continue this refactor in BYOK mode.',
        },
      ],
    });

    expect(result.draft.targetPrivacyMode).toBe('byok');
    expect(result.draft.targetProviderMode).toBe('DirectByok');
    expect(result.draft.consentRequired).toBe(true);
    expect(result.draft.previewHashSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.redactionReport.blocked).toBe(false);
    expect(result.redactionReport.findings).toEqual([]);
    expect(result.redactedPayload).toContain('Please continue this refactor');
    expect(result.draft.selectedContext[0]?.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('redacts and blocks secret-bearing Local to BYOK handoff drafts by default', async () => {
    const result = await buildLocalToByokHandoffDraft({
      sourceSessionId: 'desktop-session-1',
      sourceSurface: 'desktop',
      targetSurface: 'web',
      createdAt: '2026-05-21T00:00:00.000Z',
      expiresAt: '2026-05-21T01:00:00.000Z',
      selectedContext: [
        {
          id: 'ctx-secret',
          kind: 'file',
          label: '.env',
          sourceUri: 'file:///repo/.env',
          content: 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456',
        },
      ],
    });

    expect(result.redactionReport.blocked).toBe(true);
    expect(result.redactionReport.findings.map((finding) => finding.ruleId)).toContain(
      'generic-api-key',
    );
    expect(result.redactionReport.findings[0]?.location).toBe('file:///repo/.env');
    expect(result.redactedPayload).toContain('OPENAI_API_KEY=[REDACTED_API_KEY]');
    expect(result.redactedPayload).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
  });

  it('exposes secret-scan findings from the same redaction patterns used by logging', () => {
    const report = redactSecretsWithReport('Authorization: Bearer abcDEF1234567890abcdef');

    expect(report.redactedText).toBe('Authorization: Bearer [REDACTED_TOKEN]');
    expect(report.redactedByteCount).toBeGreaterThan(20);
    expect(scanSecrets('GH=ghp_1234567890abcdefghijklmnopqrstuvwxyz')).toMatchObject([
      { ruleId: 'github-token', severity: 'critical' },
    ]);
  });
});
