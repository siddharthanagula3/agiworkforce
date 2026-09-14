import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { buildVsCodeContextHandoffUri, type LocalContextHandoff } from '@agiworkforce/types';
import {
  buildContextHandoffDraft,
  handleContextHandoffUri,
  readContextHandoffUri,
} from '../features/context-handoff';

const HANDOFF: LocalContextHandoff = {
  id: 'ctx_12345678',
  sourceUrl: 'https://example.com/docs',
  selectedText: 'the paragraph the user picked',
};

function makeTarget() {
  return { prefillComposer: vi.fn(), reveal: vi.fn().mockResolvedValue(undefined) };
}

describe('browser context handoff uri', () => {
  beforeEach(() => {
    vi.mocked(vscode.window.showWarningMessage).mockReset().mockResolvedValue(undefined);
  });

  it('places the selection and its source in the composer without sending it', async () => {
    const target = makeTarget();
    const uri = vscode.Uri.parse(buildVsCodeContextHandoffUri(HANDOFF));

    await expect(handleContextHandoffUri(uri, target)).resolves.toBe(true);

    expect(readContextHandoffUri(uri)).toEqual(HANDOFF);
    const draft = target.prefillComposer.mock.calls[0]?.[0] as string;
    expect(draft).toBe(buildContextHandoffDraft(HANDOFF));
    expect(draft).toContain('https://example.com/docs');
    expect(draft).toContain('the paragraph the user picked');
    expect(target.reveal).toHaveBeenCalledOnce();
  });

  it('says the link is expired or malformed instead of placing nothing', async () => {
    const target = makeTarget();
    const uri = vscode.Uri.parse('vscode://agiworkforce.agi-workforce/handoff?v=1&id=ctx_1');

    await expect(handleContextHandoffUri(uri, target)).resolves.toBe(false);

    expect(target.prefillComposer).not.toHaveBeenCalled();
    expect(vi.mocked(vscode.window.showWarningMessage).mock.calls[0]?.[0]).toContain(
      'expired or malformed',
    );
  });

  it('answers a path it does not handle instead of failing silently', async () => {
    const uri = vscode.Uri.parse('vscode://agiworkforce.agi-workforce/something-else?v=1');

    await expect(handleContextHandoffUri(uri, makeTarget())).resolves.toBe(false);
    expect(readContextHandoffUri(uri)).toBeNull();
    expect(vi.mocked(vscode.window.showWarningMessage).mock.calls[0]?.[0]).toContain(
      'does not handle',
    );
  });

  it('tells the user when the chat view cannot take the selection', async () => {
    const uri = vscode.Uri.parse(buildVsCodeContextHandoffUri(HANDOFF));

    await expect(handleContextHandoffUri(uri, undefined)).resolves.toBe(false);
    expect(vi.mocked(vscode.window.showWarningMessage).mock.calls[0]?.[0]).toContain(
      'chat view is not available',
    );
  });
});
