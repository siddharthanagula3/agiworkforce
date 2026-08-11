/**
 * Coverage for the on-device VL (multimodal) route: when a multimodal GGUF model
 * and its mmproj projector are both present on disk, runVisionQuery must pass the
 * real image into the model via `images` + `mmprojPath` (llama.rn initMultimodal),
 * not fall back to OCR.
 */

import { runVisionQuery, resolveVisionRoute } from '../src/features/image/services/vision';
import { listInstalledModels } from '@/storage/installedModels';
import { getModelsForRole, localGenerate } from '@agiworkforce/local-llm';

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

const VISION_CATALOG_MODEL = getModelsForRole('premium-vision-pack').find(
  (model) => model.format === 'gguf' && model.mmprojUrl && model.capabilities.visionIn,
);

if (!VISION_CATALOG_MODEL) {
  throw new Error('Local catalog has no GGUF vision model with a projector');
}

const VISION_MODEL_PATH = `file:///models/${VISION_CATALOG_MODEL.id}/model.gguf`;

describe('runVisionQuery on-device VL route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listInstalledModels as jest.Mock).mockResolvedValue([
      {
        id: VISION_CATALOG_MODEL.id,
        display_name: VISION_CATALOG_MODEL.displayName,
        runtime: 'local',
        format: 'gguf',
        size_bytes: VISION_CATALOG_MODEL.fileSizeBytes,
        sha256: null,
        local_path: VISION_MODEL_PATH,
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
      modelId: VISION_CATALOG_MODEL.id,
      displayName: VISION_CATALOG_MODEL.displayName,
    });
  });

  it('passes the image and mmproj path straight into the multimodal model', async () => {
    const result = await runVisionQuery({
      imageUri: 'file:///tmp/photo.jpg',
      question: 'What breed is this dog?',
    });

    expect(localGenerate).toHaveBeenCalledWith(
      VISION_MODEL_PATH,
      expect.objectContaining({
        modelId: VISION_CATALOG_MODEL.id,
        prompt: 'What breed is this dog?',
        images: ['file:///tmp/photo.jpg'],
        mmprojPath: `${VISION_MODEL_PATH}.mmproj.gguf`,
      }),
    );
    expect(result.route.kind).toBe('vl-pack');
    expect(result.text).toBe('A golden retriever on grass.');
  });
});
