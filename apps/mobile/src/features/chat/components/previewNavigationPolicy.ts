export function isAllowedPreviewNavigation(url: string): boolean {
  return url === 'about:blank' || url === 'about:srcdoc' || url.startsWith('data:');
}
