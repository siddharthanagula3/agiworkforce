import { isAllowedPreviewNavigation } from '../previewNavigationPolicy';

describe('SafeArtifactPreview navigation guard', () => {
  it('rejects a lookalike host that merely begins with the CDN name', () => {
    expect(isAllowedPreviewNavigation('https://cdn.jsdelivr.net.evil.com/payload.js', true)).toBe(
      false,
    );
    expect(isAllowedPreviewNavigation('https://cdn.jsdelivr.network/x.js', true)).toBe(false);
    expect(isAllowedPreviewNavigation('https://cdn.jsdelivr.net@evil.com/x.js', true)).toBe(false);
  });

  it('still allows the pinned mermaid bundle', () => {
    expect(
      isAllowedPreviewNavigation(
        'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
        true,
      ),
    ).toBe(true);
  });

  it.each(['about:blank', 'about:srcdoc', 'data:text/html,<p>hi</p>'])(
    'allows the in-memory document the component supplied: %s',
    (url) => {
      expect(isAllowedPreviewNavigation(url, false)).toBe(true);
    },
  );

  it('never reaches the CDN branch for non-mermaid artifacts', () => {
    expect(
      isAllowedPreviewNavigation(
        'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
        false,
      ),
    ).toBe(false);
  });

  it.each([
    'https://evil.com/',
    'http://cdn.jsdelivr.net/npm/mermaid.js',
    'file:///etc/passwd',
    'javascript:alert(1)',
  ])('rejects arbitrary remote navigation: %s', (url) => {
    expect(isAllowedPreviewNavigation(url, true)).toBe(false);
  });
});
