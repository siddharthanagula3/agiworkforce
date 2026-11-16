const PREVIEW_DOCUMENT = /^about:(?:blank|srcdoc)(?:#.*)?$/;

export function isAllowedPreviewNavigation(url: string): boolean {
  return PREVIEW_DOCUMENT.test(url);
}
