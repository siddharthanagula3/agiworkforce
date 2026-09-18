export type MacArchitecture = 'arm64' | 'x64';
export type DetectedArchitecture = MacArchitecture | 'unknown';

interface HighEntropyNavigator {
  userAgentData?: {
    getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
  };
}

// A browser that blocks canvas fingerprinting throws here rather than
// answering, and an unreadable GPU is simply an undetected architecture.
function fromGpuRenderer(canvas: HTMLCanvasElement | null): DetectedArchitecture {
  try {
    const gl = canvas?.getContext('webgl') ?? null;
    if (!gl) return 'unknown';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'unknown';
    const renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? '');
    if (/intel|amd|radeon/i.test(renderer)) return 'x64';
    if (/apple/i.test(renderer)) return 'arm64';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Which installer this Mac wants. Chrome answers directly; every other browser
 * reports an Intel user agent on Apple silicon too, so the GPU name is the only
 * signal left. Both answers are guesses, which is why the caller recommends an
 * architecture rather than hiding the other one.
 */
export async function detectMacArchitecture(
  navigatorLike: Navigator | undefined,
  createCanvas: () => HTMLCanvasElement | null,
): Promise<DetectedArchitecture> {
  const highEntropy = (navigatorLike as HighEntropyNavigator | undefined)?.userAgentData;
  if (highEntropy?.getHighEntropyValues) {
    try {
      const values = await highEntropy.getHighEntropyValues(['architecture']);
      if (values.architecture === 'arm') return 'arm64';
      if (values.architecture === 'x86') return 'x64';
    } catch {
      return fromGpuRenderer(createCanvas());
    }
  }
  return fromGpuRenderer(createCanvas());
}
