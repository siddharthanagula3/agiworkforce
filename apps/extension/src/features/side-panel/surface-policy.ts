export interface ChromeSurfaceAvailabilityInput {
  nativeConnected: boolean;
  restrictedPage: boolean;
}

export interface ChromeSurfaceAvailability {
  chat: true;
  pageContext: boolean;
  nativeTools: boolean;
}

export function getChromeSurfaceAvailability(
  input: ChromeSurfaceAvailabilityInput,
): ChromeSurfaceAvailability {
  return {
    chat: true,
    pageContext: !input.restrictedPage,
    nativeTools: input.nativeConnected,
  };
}

const RESTRICTED_URL_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'chrome-untrusted://',
  'devtools://',
  'edge://',
  'about:',
  'data:',
  'file:///',
  'view-source:',
  'https://chromewebstore.google.com/',
  'https://chrome.google.com/webstore',
];

export function isRestrictedPageUrl(url: string): boolean {
  if (!url) return false;
  return RESTRICTED_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}
