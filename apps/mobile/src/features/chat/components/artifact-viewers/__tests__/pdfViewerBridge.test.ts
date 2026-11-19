import {
  PDF_VIEWER_CHUNK_BYTES,
  isPdfViewerNavigation,
  parsePdfViewerMessage,
  pdfViewerChunkScript,
  pdfViewerStartScript,
} from '../pdfViewerBridge';

describe('pdf viewer bridge', () => {
  it.each([
    ['{"type":"ready"}', { type: 'ready' }],
    ['{"type":"received","bytes":0}', { type: 'received', bytes: 0 }],
    ['{"type":"received","bytes":262144}', { type: 'received', bytes: 262144 }],
    ['{"type":"loaded","pages":12}', { type: 'loaded', pages: 12 }],
    ['{"type":"page","page":3}', { type: 'page', page: 3 }],
    ['{"type":"failed","reason":"password"}', { type: 'failed', reason: 'password' }],
    ['{"type":"failed","reason":"invalid"}', { type: 'failed', reason: 'invalid' }],
    ['{"type":"failed","reason":"error"}', { type: 'failed', reason: 'error' }],
  ])('reads %s', (data, expected) => {
    expect(parsePdfViewerMessage(data)).toEqual(expected);
  });

  it.each([
    'not json',
    'null',
    '42',
    '{}',
    '{"type":"unknown"}',
    '{"type":"received","bytes":-1}',
    '{"type":"received","bytes":1.5}',
    '{"type":"received","bytes":"10"}',
    '{"type":"loaded","pages":0}',
    '{"type":"page","page":0}',
    '{"type":"failed"}',
    '{"type":"failed","reason":"boom"}',
  ])('refuses %s', (data) => {
    expect(parsePdfViewerMessage(data)).toBeNull();
  });

  it('sends bytes in chunks the bridge carries comfortably', () => {
    expect(PDF_VIEWER_CHUNK_BYTES).toBeGreaterThan(0);
    expect(PDF_VIEWER_CHUNK_BYTES).toBeLessThanOrEqual(1024 * 1024);
  });

  it('builds scripts that only call the viewer with data', () => {
    expect(
      pdfViewerStartScript({ size: 10, page: 2, background: '#000000', border: '#111111' }),
    ).toBe(
      'window.pdfViewer.begin({"size":10,"page":2,"background":"#000000","border":"#111111"});true;',
    );
    expect(pdfViewerChunkScript('QUJD')).toBe('window.pdfViewer.chunk("QUJD");true;');
  });

  it('keeps a value that is not base64 from leaving its string', () => {
    const script = pdfViewerChunkScript('");alert(1);("');

    expect(script).toBe('window.pdfViewer.chunk("\\");alert(1);(\\"");true;');
    expect(
      pdfViewerStartScript({ size: 1, page: 1, background: '"});x;({"', border: '#fff' }),
    ).toContain('"background":"\\"});x;({\\""');
  });

  it('lets the page stay where it is and refuses every other address', () => {
    expect(isPdfViewerNavigation('about:blank')).toBe(true);
    expect(isPdfViewerNavigation('')).toBe(true);
    expect(isPdfViewerNavigation('https://example.test/file.pdf')).toBe(false);
    expect(isPdfViewerNavigation('file:///data/user/0/app/cache/report.pdf')).toBe(false);
    expect(isPdfViewerNavigation('javascript:alert(1)')).toBe(false);
    expect(isPdfViewerNavigation('intent://scan#Intent;end')).toBe(false);
  });
});
