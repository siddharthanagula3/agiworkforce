import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(__dirname, '../app/(app)/chat/[id].tsx'), 'utf8');
const offlineBranchStart = source.indexOf(
  "if (!isOnline && conversationExecutionMode === 'cloud') {",
);
const onlineSendStart = source.indexOf('const sendOptions =', offlineBranchStart);
const offlineBranch = source.slice(offlineBranchStart, onlineSendStart);
const attachmentRefusal = offlineBranch.match(
  /if \(attachments\?\.length\) \{\s*Alert\.alert\([\s\S]*?\);\s*return false;\s*\}/,
);

describe('offline Cloud attachment refusal source shape', () => {
  it('refuses files explicitly inside the offline Cloud branch', () => {
    expect(offlineBranchStart).toBeGreaterThan(-1);
    expect(onlineSendStart).toBeGreaterThan(offlineBranchStart);
    expect(attachmentRefusal).not.toBeNull();
    expect(attachmentRefusal?.[0]).toContain('Connect to send attachments');
    expect(attachmentRefusal?.[0]).toContain('Attachments cannot be queued offline.');
    expect(attachmentRefusal?.[0]).toContain('Reconnect and send again.');
  });

  it('returns false before clearing the quote or skill and before queuing a message', () => {
    expect(attachmentRefusal).not.toBeNull();
    const refusalEnd = (attachmentRefusal?.index ?? -1) + (attachmentRefusal?.[0].length ?? 0);
    for (const mutation of [
      'quotedMessageScopeRef.current = null',
      'setQuotedMessage(null)',
      'offlineQueue.enqueue(',
      'enqueueOfflineMessage(',
      'clearSelectedSkill()',
    ]) {
      expect(offlineBranch.indexOf(mutation)).toBeGreaterThan(refusalEnd);
    }
  });

  it('keeps media dispatch ahead of the guard and retains text-only offline admission', () => {
    const imageDispatchStart = source.indexOf("if (imageRequest.status === 'ready') {");
    const videoDispatchStart = source.indexOf("if (videoRequest.status === 'ready') {");
    expect(imageDispatchStart).toBeGreaterThan(-1);
    expect(videoDispatchStart).toBeGreaterThan(-1);
    expect(imageDispatchStart).toBeLessThan(offlineBranchStart);
    expect(videoDispatchStart).toBeLessThan(offlineBranchStart);
    expect(offlineBranch).toContain('content: finalText');
    expect(offlineBranch).toContain('model: selectedModel');
    expect(offlineBranch).toContain('return true;');
    expect(source.slice(onlineSendStart)).toMatch(
      /sendMessage\(id, finalText, selectedModel, attachments, \{\s*\.\.\.sendOptions,/,
    );
  });
});
