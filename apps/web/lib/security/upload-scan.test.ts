import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { inspectUploadBytes } from './upload-scan';

/**
 * Uploads reached a publicly-servable URL after only three checks, path
 * safety, a MIME allowlist, and a byte count, none of which open the file.
 * These cover the shapes that are dangerous specifically because of how this
 * product serves them.
 */

const bytes = (...values: number[]) => Uint8Array.from(values);
const utf8 = (text: string) => new TextEncoder().encode(text);

const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04);
const PDF = utf8('%PDF-1.7\nharmless document body');

describe('inspectUploadBytes, honest files', () => {
  it.each([
    ['image/png', PNG],
    ['image/jpeg', JPEG],
    ['application/pdf', PDF],
  ])('accepts a real %s', (mime, content) => {
    expect(inspectUploadBytes(content, mime).ok).toBe(true);
  });

  it('accepts a plain text file', () => {
    expect(inspectUploadBytes(utf8('just some notes'), 'text/plain').ok).toBe(true);
  });

  it('tolerates a charset on the declared type', () => {
    expect(inspectUploadBytes(utf8('hello'), 'text/plain; charset=utf-8').ok).toBe(true);
  });
});

describe('inspectUploadBytes, type confusion', () => {
  it('rejects a ZIP disguised as a PNG', () => {
    const result = inspectUploadBytes(ZIP, 'image/png');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === 'type_confusion')).toBe(true);
  });

  it('rejects a PDF disguised as a JPEG', () => {
    const result = inspectUploadBytes(PDF, 'image/jpeg');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === 'type_confusion')).toBe(true);
  });

  it('rejects an image MIME whose bytes match no image format', () => {
    const result = inspectUploadBytes(utf8('not an image at all'), 'image/png');
    expect(result.ok).toBe(false);
  });
});

describe('inspectUploadBytes, executables', () => {
  it.each([
    ['DOS/PE', bytes(0x4d, 0x5a, 0x90, 0x00)],
    ['ELF', bytes(0x7f, 0x45, 0x4c, 0x46)],
    ['Mach-O', bytes(0xcf, 0xfa, 0xed, 0xfe)],
    ['shebang script', utf8('#!/bin/sh\nrm -rf /')],
  ])('rejects a %s however it is declared', (_label, content) => {
    const result = inspectUploadBytes(content, 'text/plain');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === 'executable')).toBe(true);
  });
});

describe('inspectUploadBytes, SVG active content', () => {
  it('accepts a static SVG', () => {
    const svg = utf8(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
    );
    expect(inspectUploadBytes(svg, 'image/svg+xml').ok).toBe(true);
  });

  it.each([
    ['script element', '<svg><script>fetch("/api/me")</script></svg>'],
    ['inline handler', '<svg><rect onload="alert(1)"/></svg>'],
    ['javascript: URL', '<svg><a href="javascript:alert(1)">x</a></svg>'],
    ['foreignObject', '<svg><foreignObject><iframe src="x"/></foreignObject></svg>'],
  ])('rejects an SVG carrying a %s', (_label, markup) => {
    const result = inspectUploadBytes(utf8(markup), 'image/svg+xml');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === 'active_content_svg')).toBe(true);
  });

  it('is case-insensitive, so uppercase markup cannot evade it', () => {
    const result = inspectUploadBytes(utf8('<SVG><SCRIPT>x</SCRIPT></SVG>'), 'image/svg+xml');
    expect(result.ok).toBe(false);
  });

  it.each([
    ['script with a solidus separator', '<svg><script/src="https://evil.test/x.js"></svg>'],
    ['handler after a solidus', '<svg/onload=alert(1)>'],
    ['foreignObject with a solidus', '<svg><foreignobject/x></svg>'],
  ])('rejects %s, which the [\\s>] classes used to miss', (_label, markup) => {
    const result = inspectUploadBytes(utf8(markup), 'image/svg+xml');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === 'active_content_svg')).toBe(true);
  });
});

describe('inspectUploadBytes, PDF active content', () => {
  it.each([
    ['JavaScript', '%PDF-1.7\n/OpenAction << /S /JavaScript /JS (app.alert(1)) >>'],
    ['launch action', '%PDF-1.7\n<< /S /Launch /F (cmd.exe) >>'],
    ['embedded file', '%PDF-1.7\n/EmbeddedFile 12 0 R'],
  ])('rejects a PDF containing %s', (_label, content) => {
    const result = inspectUploadBytes(utf8(content), 'application/pdf');
    expect(result.ok).toBe(false);
    expect(result.findings.some((f) => f.code === 'active_content_pdf')).toBe(true);
  });
});

describe('inspectUploadBytes, reporting', () => {
  it('reports every distinct problem rather than stopping at the first', () => {
    const result = inspectUploadBytes(utf8('#!/bin/sh\necho hi'), 'image/png');
    expect(result.findings.length).toBeGreaterThan(1);
    expect(result.findings.some((f) => f.code === 'executable')).toBe(true);
    expect(result.findings.some((f) => f.code === 'type_confusion')).toBe(true);
  });

  it('handles an empty file without throwing', () => {
    expect(() => inspectUploadBytes(new Uint8Array(), 'image/png')).not.toThrow();
  });
});
