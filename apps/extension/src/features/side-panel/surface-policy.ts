export interface ChromeSurfaceAvailabilityInput {
  nativeConnected: boolean;
  restrictedPage: boolean;
}

export interface ChromeSurfaceAvailability {
  /** Chrome chat is always a Managed Cloud capability, never a Desktop fallback. */
  chat: true;
  /** Page context is unavailable on browser-internal and other restricted URLs. */
  pageContext: boolean;
  /** Native connection only enables explicit Desktop/browser mechanics. */
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
