import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { DEVELOPER_REASONING_EFFORTS } from '@agiworkforce/local-runtime-contract';

import { AgiDiagnosticsProvider } from '../providers/diagnosticsProvider';
import { resolveReviewEffort, reviewDepthInstruction } from '../providers/reviewEffort';

const chatCompletion = vi.hoisted(() => vi.fn());

vi.mock('../utils/api', () => ({ chatCompletion }));

function editorWith(text: string): vscode.TextEditor {
  return {
    document: {
      uri: vscode.Uri.file('/repo/src/app.ts'),
      languageId: 'typescript',
      getText: () => text,
    },
    selection: new vscode.Selection(0, 0, 0, 0),
  } as unknown as vscode.TextEditor;
}

describe('review depth by effort', () => {
  it('gives each of the four review levels a different pass', () => {
    const passes = (['low', 'medium', 'high', 'xhigh'] as const).map(reviewDepthInstruction);
    expect(new Set(passes).size).toBe(4);
    expect(passes[0]).toContain('one quick pass');
    expect(passes[2]).toContain('Trace how each value flows');
    expect(passes[3]).toContain('second pass');
    expect(passes[3]).toContain(passes[2]);
  });

  it('treats the levels below low as a quick pass and max as the deepest', () => {
    expect(reviewDepthInstruction('none')).toBe(reviewDepthInstruction('low'));
    expect(reviewDepthInstruction('minimal')).toBe(reviewDepthInstruction('low'));
    expect(reviewDepthInstruction('max')).toContain('Unconfirmed:');
    expect(reviewDepthInstruction('max')).toContain(reviewDepthInstruction('xhigh'));
  });

  it('has an instruction decision for every level on the ladder', () => {
    for (const effort of DEVELOPER_REASONING_EFFORTS) {
      expect(typeof reviewDepthInstruction(effort)).toBe('string');
    }
  });

  it('uses the session effort when no level is passed and a passed level overrides it', () => {
    expect(resolveReviewEffort(undefined, 'high')).toBe('high');
    expect(resolveReviewEffort('xhigh', 'low')).toBe('xhigh');
    expect(resolveReviewEffort('extreme', 'low')).toBe('low');
    expect(resolveReviewEffort({ level: 'high' }, 'medium')).toBe('medium');
  });
});

describe('reviewing code at an effort', () => {
  beforeEach(() => {
    chatCompletion.mockReset();
    chatCompletion.mockResolvedValue('Looks fine.');
  });

  async function userPromptAt(effort: Parameters<typeof reviewDepthInstruction>[0]) {
    const provider = new AgiDiagnosticsProvider();
    await provider.reviewCode(
      editorWith('const a = 1;'),
      {} as vscode.SecretStorage,
      new vscode.CancellationTokenSource().token,
      effort,
    );
    const messages = chatCompletion.mock.calls.at(-1)?.[1] as { role: string; content: string }[];
    return messages.find((message) => message.role === 'user')?.content ?? '';
  }

  it('sends a different prompt for each level and leaves the medium prompt as it was', async () => {
    const low = await userPromptAt('low');
    const medium = await userPromptAt('medium');
    const xhigh = await userPromptAt('xhigh');

    expect(new Set([low, medium, xhigh]).size).toBe(3);
    expect(low).toContain('one quick pass');
    expect(medium.endsWith('```')).toBe(true);
    expect(xhigh).toContain('second pass');
    expect(xhigh).toContain('const a = 1;');
  });
});
