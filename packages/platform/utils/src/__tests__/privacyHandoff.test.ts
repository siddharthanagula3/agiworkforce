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

describe('handoff target', () => {
  const baseParams = {
    sourceSessionId: 'sess-1',
    sourceSurface: 'desktop' as const,
    targetSurface: 'desktop' as const,
    expiresAt: '2026-01-01T00:00:00.000Z',
    selectedContext: [
      {
        id: 'ctx-1',
        kind: 'file' as const,
        label: 'notes.md',
        sourceUri: 'file://notes.md',
        content: 'plain notes',
      },
    ],
  };

  it('defaults to BYOK so existing callers are unchanged', async () => {
    const preview = await buildLocalToByokHandoffDraft(baseParams);
    expect(preview.draft.targetPrivacyMode).toBe('byok');
    expect(preview.draft.targetProviderMode).toBe('DirectByok');
  });

  it('labels a Managed Cloud handoff as managed, not BYOK', async () => {
    const preview = await buildLocalToByokHandoffDraft({ ...baseParams, target: 'managed' });
    expect(preview.draft.targetPrivacyMode).toBe('managed');
    expect(preview.draft.targetProviderMode).toBe('ManagedGateway');
  });

  it('carries the target into the hashed payload, so consent attests to the destination', async () => {
    // The preview hash is what the user approves. If the target were only a
    // display string, the same hash would cover two different destinations.
    const byok = await buildLocalToByokHandoffDraft(baseParams);
    const managed = await buildLocalToByokHandoffDraft({ ...baseParams, target: 'managed' });

    expect(managed.redactedPayload).toContain('"targetPrivacyMode": "managed"');
    expect(byok.redactedPayload).toContain('"targetPrivacyMode": "byok"');
    expect(managed.draft.previewHashSha256).not.toBe(byok.draft.previewHashSha256);
  });

  it('still blocks on findings regardless of target', async () => {
    const preview = await buildLocalToByokHandoffDraft({
      ...baseParams,
      target: 'managed',
      selectedContext: [
        {
          id: 'ctx-1',
          kind: 'file' as const,
          label: '.env',
          sourceUri: 'file://.env',
          content: 'AWS_SECRET_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE0000',
        },
      ],
    });
    expect(preview.redactionReport.blocked).toBe(true);
  });
});
