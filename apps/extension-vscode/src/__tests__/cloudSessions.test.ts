import { describe, expect, it } from 'vitest';
import type { ThreadReadResponse, ThreadSummary } from '@agiworkforce/types';
import { cloudTranscript } from '../features/trees/cloudSessions';

const THREAD: ThreadSummary = {
  id: 'cloud:5f1c',
  title: 'Fix the flaky test',
  model: 'model-1',
  cwd: '',
  provider: 'anthropic',
  trustMode: 'managed',
  createdAt: '2026-07-15T00:00:00Z',
  updatedAt: '2026-07-15T00:00:00Z',
  createdBy: 'vscode',
  status: 'idle',
  location: 'cloud',
};

function read(transcriptTruncated: boolean): ThreadReadResponse {
  return {
    thread: THREAD,
    messages: [
      { role: 'user', text: 'fix it' },
      { role: 'assistant', text: 'fixed' },
    ],
    transcriptTruncated,
    approvals: [],
    fileChanges: [],
    plan: [],
    todos: [],
  };
}

describe('cloudTranscript', () => {
  it('renders every returned turn without a notice when the session is whole', () => {
    const markdown = cloudTranscript(read(false));

    expect(markdown).toContain('**You**\n\nfix it');
    expect(markdown).toContain('**AGI**\n\nfixed');
    expect(markdown).not.toContain('Earlier turns');
  });

  it('tells the reader earlier turns are missing when the runtime says the window is bounded', () => {
    const markdown = cloudTranscript(read(true));

    expect(markdown).toContain('Earlier turns of this session are not shown here.');
    expect(markdown.indexOf('Earlier turns')).toBeLessThan(markdown.indexOf('fix it'));
  });
});
