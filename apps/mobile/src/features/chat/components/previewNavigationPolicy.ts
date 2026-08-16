
export const MERMAID_CDN_ORIGIN = 'https://cdn.jsdelivr.net';
const MERMAID_CDN_PREFIX = `${MERMAID_CDN_ORIGIN}/`;

export function isAllowedPreviewNavigation(url: string, isMermaid: boolean): boolean {
  return (
    url === 'about:blank' ||
    url === 'about:srcdoc' ||
    url.startsWith('data:') ||
    (isMermaid && url.startsWith(MERMAID_CDN_PREFIX))
  );
}
