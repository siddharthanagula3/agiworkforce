jest.mock('@/services/docParser', () => ({
  isParseableDocument: () => true,
}));

import {
  getHarnessMediaInput,
  getRegistryRoute,
  listChatModels,
  listManagedRoutesForModel,
} from '@agiworkforce/types';
import {
  imageLimitRefusal,
  maxImagesPerMessage,
} from '@/src/features/chat/utils/attachmentValidation';

const IMAGE = { mimeType: 'image/png' };
const DOCUMENT = { mimeType: 'application/pdf' };

function defaultRouteLimit(modelId: string): number | undefined {
  const route = listManagedRoutesForModel(modelId)[0];
  const harnessId = route ? getRegistryRoute(route.routeId)?.harnessId : undefined;
  return harnessId ? getHarnessMediaInput(harnessId).maxImagesPerRequest : undefined;
}

describe('maxImagesPerMessage', () => {
  it('uses a model override before its route limit', () => {
    const model = listChatModels().find(
      (candidate) => candidate.imageInput?.maxImagesPerRequest !== undefined,
    );
    expect(model).toBeDefined();
    expect(maxImagesPerMessage(model!.id)).toBe(model!.imageInput!.maxImagesPerRequest);
  });

  it("reads the limit of the model's default managed route", () => {
    const model = listChatModels().find(
      (candidate) =>
        candidate.imageInput?.maxImagesPerRequest === undefined &&
        defaultRouteLimit(candidate.id) !== undefined,
    );
    expect(model).toBeDefined();
    expect(maxImagesPerMessage(model!.id)).toBe(defaultRouteLimit(model!.id));
  });

  it('knows no limit for a selection that is not a model', () => {
    expect(maxImagesPerMessage('not-a-registered-model')).toBeNull();
  });
});

describe('imageLimitRefusal', () => {
  const model = listChatModels().find(
    (candidate) => candidate.imageInput?.maxImagesPerRequest !== undefined,
  )!;
  const limit = model.imageInput!.maxImagesPerRequest!;

  it('lets a message at the limit through and counts documents separately', () => {
    const attachments = [...Array.from({ length: limit }, () => IMAGE), DOCUMENT, DOCUMENT];
    expect(imageLimitRefusal(model.id, attachments)).toBeNull();
  });

  it('names the model, its limit and how many images to remove', () => {
    const attachments = Array.from({ length: limit + 3 }, () => IMAGE);
    expect(imageLimitRefusal(model.id, attachments)).toBe(
      `${model.name} can read up to ${limit} images in one message. Remove 3 images to send it.`,
    );
    expect(imageLimitRefusal(model.id, attachments.slice(0, limit + 1))).toContain(
      'Remove 1 image to send it.',
    );
  });

  it('refuses nothing when the model has no known limit or nothing is attached', () => {
    expect(imageLimitRefusal('not-a-registered-model', [IMAGE, IMAGE])).toBeNull();
    expect(imageLimitRefusal(model.id, undefined)).toBeNull();
  });
});
