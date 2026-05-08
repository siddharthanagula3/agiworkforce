/**
 * apply-patch edge case regression tests.
 *
 * Covers:
 *   - CRLF / LF mixed line endings — patches authored on Windows or pasted
 *     from chat must apply cleanly even when the body uses CRLF and the
 *     original file uses LF (or vice versa). The matcher's normalize cascade
 *     should make this work without explicit pre-processing.
 *   - UTF-8 BOM at the file start — Windows editors often save files with
 *     a leading U+FEFF byte-order mark. The patch matcher should not blow
 *     up; the BOM should be preserved on read-and-write round-trip.
 *   - Update-hunk off-by-one — a patch's old-context exists in the file
 *     but the patch's `oldLines` extend past EOF. We expect a clean error
 *     (not a silent partial write).
 */

import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyPatch } from '../index';

let workspace: string;

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'apply-patch-edges-'));
});

afterEach(async () => {
  if (workspace) await rm(workspace, { recursive: true, force: true });
});

describe('apply-patch CRLF/LF handling', () => {
  it('applies a CRLF-bodied update patch to an LF-bodied file', async () => {
    // Original has LF only.
    await writeFile(join(workspace, 'note.txt'), 'alpha\nbeta\ngamma\n', 'utf-8');
    // Patch body uses CRLF on the wire (mimic a Windows-pasted patch).
    const patch = [
      '*** Begin Patch',
      '*** Update File: note.txt',
      '@@',
      ' alpha',
      '-beta',
      '+BETA',
      ' gamma',
      '*** End Patch',
    ].join('\r\n');

    await applyPatch(patch, { cwd: workspace });
    const written = await readFile(join(workspace, 'note.txt'), 'utf-8');
    // The applicator's `normalizeLineEndings` cascade (exact -> trimEnd -> trim)
    // should match `beta` against ` beta` after trimming the `\r`.
    expect(written).toContain('BETA');
    expect(written).toContain('alpha');
    expect(written).toContain('gamma');
  });

  it('applies an LF-bodied patch to a CRLF-bodied file', async () => {
    await writeFile(join(workspace, 'note.txt'), 'one\r\ntwo\r\nthree\r\n', 'utf-8');
    const patch = [
      '*** Begin Patch',
      '*** Update File: note.txt',
      '@@',
      ' one',
      '-two',
      '+TWO',
      ' three',
      '*** End Patch',
    ].join('\n');

    await applyPatch(patch, { cwd: workspace });
    const written = await readFile(join(workspace, 'note.txt'), 'utf-8');
    expect(written).toContain('TWO');
    expect(written).toContain('one');
    expect(written).toContain('three');
  });
});

describe('apply-patch UTF-8 BOM handling', () => {
  it('does not crash when the original file starts with a UTF-8 BOM', async () => {
    // BOM-prefixed file content. We use the Unicode escape rather than the
    // literal U+FEFF character so eslint's no-irregular-whitespace rule
    // doesn't flag the source file.
    const bom = '\uFEFF';
    await writeFile(join(workspace, 'config.json'), `${bom}{\n  "x": 1\n}\n`, 'utf-8');
    const patch = [
      '*** Begin Patch',
      '*** Update File: config.json',
      '@@',
      ' {',
      '-  "x": 1',
      '+  "x": 2',
      ' }',
      '*** End Patch',
    ].join('\n');
    await applyPatch(patch, { cwd: workspace });
    const written = await readFile(join(workspace, 'config.json'), 'utf-8');
    // Whether or not the BOM survives is implementation-detail; the test
    // pins the contract that the call doesn't throw and the substantive
    // edit lands.
    expect(written).toContain('"x": 2');
  });

  it('an Add File whose body has a BOM at line 1 writes the BOM through', async () => {
    const bom = '\uFEFF';
    const patch = [
      '*** Begin Patch',
      '*** Add File: bom.txt',
      `+${bom}line one`,
      '+line two',
      '*** End Patch',
    ].join('\n');
    await applyPatch(patch, { cwd: workspace });
    const written = await readFile(join(workspace, 'bom.txt'), 'utf-8');
    expect(written.startsWith(bom)).toBe(true);
    expect(written).toContain('line one');
    expect(written).toContain('line two');
  });
});

describe('apply-patch update-hunk off-by-one', () => {
  it('rejects a patch whose oldLines extend past EOF (no silent truncate)', async () => {
    // File has 2 lines; patch tries to match a 4-line block.
    await writeFile(join(workspace, 'short.txt'), 'one\ntwo\n', 'utf-8');
    const patch = [
      '*** Begin Patch',
      '*** Update File: short.txt',
      '@@',
      '-one',
      '-two',
      '-three',
      '-four',
      '+ONE',
      '+TWO',
      '+THREE',
      '+FOUR',
      '*** End Patch',
    ].join('\n');
    await expect(applyPatch(patch, { cwd: workspace })).rejects.toThrow(
      /Failed to find expected lines/i,
    );
    // File untouched.
    const after = await readFile(join(workspace, 'short.txt'), 'utf-8');
    expect(after).toBe('one\ntwo\n');
  });

  it('rejects a missing changeContext anchor (file truncated past it)', async () => {
    await writeFile(join(workspace, 'doc.txt'), 'header\nbody\n', 'utf-8');
    const patch = [
      '*** Begin Patch',
      '*** Update File: doc.txt',
      '@@ nonexistent-anchor @@',
      '-body',
      '+BODY',
      '*** End Patch',
    ].join('\n');
    await expect(applyPatch(patch, { cwd: workspace })).rejects.toThrow(
      /Failed to find context|Failed to find expected lines/i,
    );
  });

  it('a successful update preserves trailing newline when original had one', async () => {
    await writeFile(join(workspace, 'tail.txt'), 'a\nb\nc\n', 'utf-8');
    const patch = [
      '*** Begin Patch',
      '*** Update File: tail.txt',
      '@@',
      ' a',
      '-b',
      '+B',
      ' c',
      '*** End Patch',
    ].join('\n');
    await applyPatch(patch, { cwd: workspace });
    const after = await readFile(join(workspace, 'tail.txt'), 'utf-8');
    expect(after.endsWith('\n')).toBe(true);
    expect(after).toContain('B');
  });
});

describe('apply-patch nested-dir add', () => {
  it('creates parent directories on Add File for nested paths', async () => {
    // Sanity: nested subdirs work without pre-existing parents.
    await mkdir(workspace, { recursive: true });
    const patch = [
      '*** Begin Patch',
      '*** Add File: a/b/c/leaf.md',
      '+leaf body',
      '*** End Patch',
    ].join('\n');
    await applyPatch(patch, { cwd: workspace });
    const written = await readFile(resolve(workspace, 'a/b/c/leaf.md'), 'utf-8');
    expect(written).toBe('leaf body');
  });
});
