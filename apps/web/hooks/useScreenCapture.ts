// Stub for desktop screen capture hook
export function useScreenCapture() {
  return {
    captureScreen: async () => null,
    captureRegion: async () => null,
    isCapturing: false,
  };
}

export default useScreenCapture;
