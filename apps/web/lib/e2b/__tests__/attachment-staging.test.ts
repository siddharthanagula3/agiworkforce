/**
 * AGI-27: a file attached to a code-execution turn never reached the sandbox,
 * so the model's first move was a write_file carrying the whole attachment back
 * in, which costs an approval and a full copy of the bytes before any analysis
 * could start. These cases pin the staging that removes that step: the bytes
 * land under the workspace root the sandbox starts in, at a path the prompt can
 * name, and the writer touches nothing but the executor it was handed.
 */
import { describe, it, expect, vi } from 'vitest';
import type { E2BExecutor } from '../types';
import {
  resolveStagedAttachments,
  stageTurnAttachments,
  stagedAttachmentPaths,
  SANDBOX_WORKSPACE_ROOT,
  type TurnAttachment,
} from '../attachment-staging';

function attachment(filename: string, body = 'a,b\n1,2\n'): TurnAttachment {
  return {
    filename,
    mimeType: 'text/csv',
    base64: Buffer.from(body, 'utf8').toString('base64'),
  };
}

function makeExecutor(writeFile: E2BExecutor['writeFile']): E2BExecutor {
  return {
    runCode: vi.fn(),
    writeFile,
    createFolder: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('resolveStagedAttachments', () => {
  it('places an attachment at the workspace root the sandbox starts in', () => {
    expect(stagedAttachmentPaths([attachment('sales.csv')])).toEqual([
      `${SANDBOX_WORKSPACE_ROOT}/sales.csv`,
    ]);
  });

  it('keeps a user-supplied name from addressing anything but a workspace leaf', () => {
    const paths = stagedAttachmentPaths([
      attachment('../../etc/passwd'),
      attachment('/absolute/report.csv'),
      attachment('.hidden.csv'),
      attachment('quarter one (final).csv'),
    ]);

    expect(paths).toEqual([
      `${SANDBOX_WORKSPACE_ROOT}/passwd`,
      `${SANDBOX_WORKSPACE_ROOT}/report.csv`,
      `${SANDBOX_WORKSPACE_ROOT}/hidden.csv`,
      `${SANDBOX_WORKSPACE_ROOT}/quarter_one_final_.csv`,
    ]);
  });

  it('gives a repeated filename its own path so the second file is not lost', () => {
    const paths = stagedAttachmentPaths([
      attachment('data.csv'),
      attachment('data.csv'),
      attachment('data.csv'),
    ]);

    expect(paths).toEqual([
      `${SANDBOX_WORKSPACE_ROOT}/data.csv`,
      `${SANDBOX_WORKSPACE_ROOT}/data-2.csv`,
      `${SANDBOX_WORKSPACE_ROOT}/data-3.csv`,
    ]);
  });

  it('names an attachment whose filename sanitises to nothing', () => {
    expect(stagedAttachmentPaths([attachment('...')])).toEqual([
      `${SANDBOX_WORKSPACE_ROOT}/attachment-1`,
    ]);
  });

  it('skips an attachment with no bytes rather than writing an empty file', () => {
    expect(
      resolveStagedAttachments([{ filename: 'empty.csv', mimeType: 'text/csv', base64: '' }]),
    ).toEqual([]);
  });
});

describe('stageTurnAttachments', () => {
  it('writes the attachment bytes as base64 at the path the prompt names', async () => {
    const writeFile = vi.fn().mockResolvedValue({ ok: true, output: 'Wrote' });
    const staged = attachment('sales.csv');

    const outcome = await stageTurnAttachments(makeExecutor(writeFile), [staged]);

    expect(writeFile).toHaveBeenCalledWith({
      path: `${SANDBOX_WORKSPACE_ROOT}/sales.csv`,
      content: staged.base64,
      encoding: 'base64',
    });
    expect(outcome).toEqual({ staged: [`${SANDBOX_WORKSPACE_ROOT}/sales.csv`], failed: [] });
  });

  it('stages the rest when one file fails or throws', async () => {
    const writeFile = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, output: '', error: 'disk full' })
      .mockRejectedValueOnce(new Error('sandbox went away'))
      .mockResolvedValueOnce({ ok: true, output: 'Wrote' });

    const outcome = await stageTurnAttachments(makeExecutor(writeFile), [
      attachment('one.csv'),
      attachment('two.csv'),
      attachment('three.csv'),
    ]);

    expect(outcome.staged).toEqual([`${SANDBOX_WORKSPACE_ROOT}/three.csv`]);
    expect(outcome.failed).toEqual([
      `${SANDBOX_WORKSPACE_ROOT}/one.csv`,
      `${SANDBOX_WORKSPACE_ROOT}/two.csv`,
    ]);
  });

  /**
   * Sandbox slots are a small per-user quota that leaked sandboxes have
   * exhausted before, so staging may only ever use the executor it is given:
   * it must never reach for one of its own, and an empty manifest must not
   * touch the sandbox at all.
   */
  it('touches nothing when the turn carried no attachments', async () => {
    const writeFile = vi.fn();

    const outcome = await stageTurnAttachments(makeExecutor(writeFile), []);

    expect(writeFile).not.toHaveBeenCalled();
    expect(outcome).toEqual({ staged: [], failed: [] });
  });
});
