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
