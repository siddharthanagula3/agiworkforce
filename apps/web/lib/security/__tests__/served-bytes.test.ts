import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { servedByteHeaders } from '../served-bytes';

describe('servedByteHeaders', () => {
  it('serves markup as an attachment of opaque bytes', () => {
    expect(servedByteHeaders({ contentType: 'image/svg+xml', filename: 'logo.svg' })).toEqual({
      contentType: 'application/octet-stream',
      contentDisposition: 'attachment; filename="logo.svg"',
    });
  });

  it('keeps a plain ASCII filename exactly as it was', () => {
    expect(
      servedByteHeaders({ contentType: 'application/pdf', filename: 'report q3.pdf' })
        .contentDisposition,
    ).toBe('inline; filename="report q3.pdf"');
  });

  it('gives a non-ASCII filename a quoted fallback and an encoded original', () => {
    const served = servedByteHeaders({
      contentType: 'application/pdf',
      filename: '报告 "final".pdf',
      forceAttachment: true,
    });

    expect(served.contentDisposition).toBe(
      `attachment; filename="__ _final_.pdf"; filename*=UTF-8''${encodeURIComponent('报告 "final".pdf')}`,
    );
    expect(() => new Headers({ 'content-disposition': served.contentDisposition })).not.toThrow();
  });

  it('never lets a line break into the header', () => {
    const served = servedByteHeaders({
      contentType: 'text/plain',
      filename: 'a\r\nSet-Cookie: x=1.txt',
    });

    expect(served.contentDisposition).not.toMatch(/[\r\n]/);
  });
});
