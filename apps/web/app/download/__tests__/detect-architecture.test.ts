import { describe, expect, it } from 'vitest';

import { detectMacArchitecture } from '../detect-architecture';

function navigatorWith(architecture: string | undefined): Navigator {
  return {
    userAgentData: { getHighEntropyValues: async () => ({ architecture }) },
  } as unknown as Navigator;
}

function canvasReporting(renderer: string | null): () => HTMLCanvasElement | null {
  if (renderer === null) return () => null;
  const gl = {
    getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 37446 }),
    getParameter: () => renderer,
  };
  return () => ({ getContext: () => gl }) as unknown as HTMLCanvasElement;
}

describe('detectMacArchitecture', () => {
  it('takes the browser at its word when it reports the architecture', async () => {
    await expect(
      detectMacArchitecture(navigatorWith('arm'), canvasReporting('Intel Iris Pro')),
    ).resolves.toBe('arm64');
    await expect(detectMacArchitecture(navigatorWith('x86'), canvasReporting(null))).resolves.toBe(
      'x64',
    );
  });

  it('falls back to the GPU name, which is the only signal Safari leaves', async () => {
    await expect(detectMacArchitecture(undefined, canvasReporting('Apple M3 Pro'))).resolves.toBe(
      'arm64',
    );
    await expect(
      detectMacArchitecture(undefined, canvasReporting('Intel(R) Iris(TM) Plus Graphics')),
    ).resolves.toBe('x64');
    await expect(
      detectMacArchitecture(undefined, canvasReporting('AMD Radeon Pro 5500M')),
    ).resolves.toBe('x64');
  });

  it('answers unknown rather than guessing when nothing can be read', async () => {
    await expect(detectMacArchitecture(undefined, canvasReporting(null))).resolves.toBe('unknown');
    await expect(
      detectMacArchitecture(undefined, canvasReporting('Mesa Software Rasterizer')),
    ).resolves.toBe('unknown');
    await expect(
      detectMacArchitecture(navigatorWith(undefined), canvasReporting(null)),
    ).resolves.toBe('unknown');
  });

  it('survives a browser that refuses either probe', async () => {
    const refusing = {
      userAgentData: {
        getHighEntropyValues: async () => {
          throw new Error('blocked');
        },
      },
    } as unknown as Navigator;
    const throwingCanvas = () =>
      ({
        getContext: () => {
          throw new Error('canvas fingerprinting blocked');
        },
      }) as unknown as HTMLCanvasElement;

    await expect(detectMacArchitecture(refusing, throwingCanvas)).resolves.toBe('unknown');
  });
});
