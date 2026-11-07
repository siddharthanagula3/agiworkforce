import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('read-aloud caller lifetime scopes', () => {
  it('scopes Chat to the rendered conversation', () => {
    expect(source('features/chat/components/messages/ChatMessageList.tsx')).toContain(
      'useTTS(conversationId)',
    );
  });
  it('threads cloud, local-runtime and shared snapshot lifetimes through reply actions', () => {
    const transcript = source('features/code/components/CodeTranscript.tsx');
    expect(transcript).toContain('readAloudScope={session.id}');
    expect(transcript).toContain('readAloudScope={readAloudScope}');
    expect(transcript).toContain('useTTS(readAloudScope, !readAloudUnavailableReason)');
    expect(source('features/code/components/LocalSessionPanel.tsx')).toContain(
      'readAloudScope={JSON.stringify([session.rootId, session.id])}',
    );
    expect(source('features/code/components/LocalSessionPanel.tsx')).toContain(
      'readAloudUnavailableReason={codeReadAloudUnavailable(session.trustMode)}',
    );
    expect(source('features/code/SharedCodeSessionPage.tsx')).toContain('readAloudScope={token}');
  });
  it('keeps cloud and shared origin unclassified rather than manufacturing managed labels', () => {
    expect(source('features/code/SharedCodeSessionPage.tsx')).not.toContain(
      'codeReadAloudUnavailable',
    );
    expect(source('features/code/components/CodeTranscript.tsx')).not.toContain(
      "codeReadAloudUnavailable('managed')",
    );
  });
  it('keeps the settings preview explicitly on device speech', () => {
    expect(source('features/settings/sections/GeneralSection.tsx')).toContain('deviceVoice: true');
  });
});
