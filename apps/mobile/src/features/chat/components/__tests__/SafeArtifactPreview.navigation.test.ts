import { isAllowedPreviewNavigation } from '../previewNavigationPolicy';

describe('SafeArtifactPreview navigation guard', () => {
  it.each(['about:blank', 'about:srcdoc', 'data:text/html,<p>hi</p>'])(
    'allows the in-memory document the component supplied: %s',
    (url) => {
      expect(isAllowedPreviewNavigation(url)).toBe(true);
    },
  );

  it.each([
    'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
    'https://cdn.jsdelivr.net.evil.com/payload.js',
    'https://evil.com/',
    'http://cdn.jsdelivr.net/npm/mermaid.js',
    'file:///etc/passwd',
    'javascript:alert(1)',
  ])('rejects every remote or local load now that diagrams ship in the app: %s', (url) => {
    expect(isAllowedPreviewNavigation(url)).toBe(false);
  });
});
