import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(import.meta.dirname, '../WebChatPage.tsx'), 'utf8');

function sourceBetween(start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('WebChatPage dormant local-to-BYOK handoff', () => {
  it('only reports that direct BYOK is unavailable, without creating or sending a fork', () => {
    const confirm = sourceBetween('const handleConfirmHandoff =', 'const handleNewChat =');

    expect(confirm).toContain('Direct BYOK is not available on web. Nothing was sent.');
    expect(confirm.match(/\b[A-Za-z_$][\w$]*\s*\(/g)).toEqual([
      'useCallback(',
      'setHandoffError(',
    ]);
    expect(source).not.toContain('async function saveSystemMessage(');
    expect(source).not.toContain('buildAcceptedHandoffSystemMessage');
  });

  it('keeps the draft, attachments, and pending preview when confirmation is refused', () => {
    const confirm = sourceBetween('const handleConfirmHandoff =', 'const handleNewChat =');
    const send = sourceBetween('const handleSend =', 'const currentHandleSendRef =');

    expect(send).toContain("if (decision === 'ceremony') return false;");
    expect(send).toContain('content: outgoingContent,');
    expect(send).toContain('attachments,');
    expect(send).toContain('meta: resolvedMeta,');
    expect(confirm).not.toMatch(
      /set(?:ComposerClearSignal|PendingByokHandoff|SelectedHandoffContextIds|HandoffPreview|BareChatSessionId)\(/,
    );
    expect(source).toContain('preview={handoffPreview}');
    expect(source).toContain('error={handoffError}');
    expect(source).toContain('onConfirm={handleConfirmHandoff}');
  });

  it('keeps cancel available without clearing the composer or navigating away', () => {
    const close = sourceBetween('const closeHandoffDialog =', 'const handleToggleHandoffContext =');

    expect(source).not.toContain('isConfirmingHandoff');
    expect(source).toContain('if (!open) closeHandoffDialog();');
    expect(close).toContain('setPendingByokHandoff(null);');
    expect(close).toContain('setSelectedHandoffContextIds([]);');
    expect(close).toContain('setHandoffPreview(null);');
    expect(close).toContain('setHandoffError(null);');
    expect(close.match(/\b[A-Za-z_$][\w$]*\s*\(/g)).toEqual([
      'useCallback(',
      'setPendingByokHandoff(',
      'setSelectedHandoffContextIds(',
      'setHandoffPreview(',
      'setHandoffError(',
    ]);
  });
});
