/**
 * Coverage for the on-device VL (multimodal) route: when a multimodal GGUF model
 * and its mmproj projector are both present on disk, runVisionQuery must pass the
 * real image into the model via `images` + `mmprojPath` (llama.rn initMultimodal),
 * not fall back to OCR.
 */

import { runVisionQuery, resolveVisionRoute } from '../src/features/image/services/vision';
import { listInstalledModels } from '@/storage/installedModels';
import { localGenerate } from '@agiworkforce/local-llm';

jest.mock('@/storage/installedModels', () => ({
  listInstalledModels: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true }),
}));

// Use the REAL catalog + isMultimodalModel from local-llm; only stub the
// inference entrypoint so the test never touches native runtimes.
jest.mock('@agiworkforce/local-llm', () => {
  const actual = jest.requireActual('@agiworkforce/local-llm');
  return { ...actual, localGenerate: jest.fn() };
});

describe('runVisionQuery on-device VL route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listInstalledModels as jest.Mock).mockResolvedValue([
      {
        id: 'qwen3-vl-2b-instruct',
        display_name: 'AGI Vision Pack',
        runtime: 'local',
        format: 'gguf',
        size_bytes: 1_107_409_952,
        sha256: null,
        local_path: 'file:///models/qwen3-vl.gguf',
        installed_at: 1,
        last_used_at: null,
        capabilities: null,
      },
    ]);
    (localGenerate as jest.Mock).mockResolvedValue({
      text: 'A golden retriever on grass.',
      runtime: 'llama_rn',
      aborted: false,
    });
  });

  it('resolves to the vl-pack route when the model + mmproj are installed', async () => {
    const route = await resolveVisionRoute();
    expect(route).toEqual({
      kind: 'vl-pack',
      modelId: 'qwen3-vl-2b-instruct',
      displayName: 'AGI Vision Pack',
    });
  });

  it('passes the image and mmproj path straight into the multimodal model', async () => {
    const result = await runVisionQuery({
      imageUri: 'file:///tmp/photo.jpg',
      question: 'What breed is this dog?',
    });

    expect(localGenerate).toHaveBeenCalledWith(
      'file:///models/qwen3-vl.gguf',
      expect.objectContaining({
        modelId: 'qwen3-vl-2b-instruct',
        prompt: 'What breed is this dog?',
        images: ['file:///tmp/photo.jpg'],
        mmprojPath: 'file:///models/qwen3-vl.gguf.mmproj.gguf',
      }),
    );
    expect(result.route.kind).toBe('vl-pack');
    expect(result.text).toBe('A golden retriever on grass.');
  });
});
