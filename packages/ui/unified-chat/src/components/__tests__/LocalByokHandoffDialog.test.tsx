import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalToByokHandoffPreview } from '@agiworkforce/utils';
import { LocalByokHandoffDialog } from '../LocalByokHandoffDialog';

afterEach(cleanup);

function preview(overrides: Partial<LocalToByokHandoffPreview> = {}): LocalToByokHandoffPreview {
  return {
    draft: {
      id: 'handoff-abc',
      sourceSessionId: 'sess-1',
      sourceSurface: 'desktop',
      targetSurface: 'desktop',
      targetPrivacyMode: 'byok',
      targetProviderMode: 'DirectByok',
      selectedContext: [],
      redactionReport: {
        scannerVersion: 'agi-utils/privacy-handoff@1',
        findings: [],
        redactedByteCount: 0,
        blocked: false,
        generatedAt: '2026-01-01T00:00:00.000Z',
      },
      previewHashSha256: 'a'.repeat(64),
      consentRequired: true,
      expiresAt: '2026-01-01T01:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    redactedPayload: '{}',
    redactedContext: [],
    redactionReport: {
      scannerVersion: 'agi-utils/privacy-handoff@1',
      findings: [],
      redactedByteCount: 0,
      blocked: false,
      generatedAt: '2026-01-01T00:00:00.000Z',
    },
    ...overrides,
  } as LocalToByokHandoffPreview;
}

describe('LocalByokHandoffDialog target labelling', () => {
  it('defaults to the BYOK fork wording', () => {
    render(
      <LocalByokHandoffDialog
        open
        onOpenChange={vi.fn()}
        preview={preview()}
        isBuilding={false}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByText('Review BYOK fork')).toBeTruthy();
  });

  it('names Managed Cloud, not BYOK, when the target is managed', () => {
    render(
      <LocalByokHandoffDialog
        open
        onOpenChange={vi.fn()}
        preview={preview()}
        isBuilding={false}
        onConfirm={vi.fn()}
        target="managed"
      />,
    );

    expect(screen.getByText('Review what leaves this device')).toBeTruthy();
    expect(screen.queryByText('Review BYOK fork')).toBeNull();
    expect(screen.getByRole('button', { name: 'Attach these files' })).toBeTruthy();
  });

  it('keeps confirm disabled while findings block the handoff, on either target', () => {
    const blocked = preview({
      redactionReport: {
        scannerVersion: 'agi-utils/privacy-handoff@1',
        findings: [
          {
            id: 'aws-key-001',
            ruleId: 'aws-key',
            label: 'AWS access key',
            severity: 'critical' as const,
            location: '.env',
            redactedPreview: 'AKIA…',
          },
        ],
        redactedByteCount: 24,
        blocked: true,
        generatedAt: '2026-01-01T00:00:00.000Z',
      },
    } as Partial<LocalToByokHandoffPreview>);

    render(
      <LocalByokHandoffDialog
        open
        onOpenChange={vi.fn()}
        preview={blocked}
        isBuilding={false}
        onConfirm={vi.fn()}
        target="managed"
      />,
    );

    expect(
      (screen.getByRole('button', { name: 'Attach these files' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('does not present a zero-finding all-clear when selected binary bytes were unscanned', () => {
    render(
      <LocalByokHandoffDialog
        open
        onOpenChange={vi.fn()}
        preview={preview()}
        isBuilding={false}
        onConfirm={vi.fn()}
        target="managed"
        unscannedContextCount={2}
      />,
    );

    expect(screen.getByText('2 selected files were not content-scanned')).toBeTruthy();
    expect(screen.getByText('Ready with scan limits disclosed')).toBeTruthy();
    expect(screen.queryByText('Ready for confirmation')).toBeNull();
  });
});
