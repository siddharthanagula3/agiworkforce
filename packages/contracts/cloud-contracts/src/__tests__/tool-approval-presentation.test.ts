import { describe, expect, it } from 'vitest';
import {
  TOOL_APPROVAL_SCOPE_LABELS,
  effectiveToolApprovalReview,
  toolApprovalParameterRows,
  toolApprovalRawParameters,
  toolApprovalScopeConfirmation,
} from '../tool-approval-presentation';

describe('tool approval presentation', () => {
  it('treats an unreviewed request as high risk, destructive and once only', () => {
    expect(effectiveToolApprovalReview(undefined)).toEqual({
      riskTier: 'high',
      destructive: true,
      scopes: ['once'],
    });
    const review = { riskTier: 'low' as const, destructive: false, scopes: ['once' as const] };
    expect(effectiveToolApprovalReview(review)).toBe(review);
  });

  it('caps a parameter at 280 characters and the raw JSON at 20,000', () => {
    const [row] = toolApprovalParameterRows({ body: 'x'.repeat(300) });
    expect(row?.value).toBe(`${'x'.repeat(280)}…`);
    expect(toolApprovalParameterRows({ n: 3, list: [1, 2] })).toEqual([
      { key: 'n', value: '3' },
      { key: 'list', value: '[1,2]' },
    ]);
    expect(toolApprovalRawParameters({})).toBeNull();
    const raw = toolApprovalRawParameters({ body: 'y'.repeat(30_000) })!;
    expect(raw.endsWith('\n…')).toBe(true);
    expect(raw).toHaveLength(20_002);
  });

  it('names the tool on its connector when always allowing it', () => {
    expect(
      toolApprovalScopeConfirmation('always', 'Create issue', {
        connectorName: 'GitHub',
        toolLabel: 'Create issue',
      }).title,
    ).toBe('Always allow Create issue on GitHub?');
    const session = toolApprovalScopeConfirmation('session', 'Create issue');
    expect(session.title).toBe('Allow Create issue for the rest of this chat?');
    expect(session.confirmLabel).toBe(TOOL_APPROVAL_SCOPE_LABELS.session);
  });
});
