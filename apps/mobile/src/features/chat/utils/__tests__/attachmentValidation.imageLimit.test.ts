jest.mock('@/services/docParser', () => ({
  isParseableDocument: () => true,
}));

jest.mock('@agiworkforce/types', () => {
  const actual = jest.requireActual<TypesModule>('@agiworkforce/types');
  return { ...actual, getModelMetadataById: jest.fn(actual.getModelMetadataById) };
});

import {
  getHarnessMediaInput,
  getModelMetadataById,
  getRegistryRoute,
  listChatModels,
  listManagedRoutesForModel,
} from '@agiworkforce/types';
import {
  imageLimitRefusal,
  maxImagesPerMessage,
} from '@/src/features/chat/utils/attachmentValidation';

type TypesModule = typeof import('@agiworkforce/types');

const readMetadata = jest.requireActual<TypesModule>('@agiworkforce/types').getModelMetadataById;
const metadataById = jest.mocked(getModelMetadataById);

const IMAGE = { mimeType: 'image/png' };
const DOCUMENT = { mimeType: 'application/pdf' };

function defaultRouteLimit(modelId: string): number | undefined {
  const route = listManagedRoutesForModel(modelId)[0];
  const harnessId = route ? getRegistryRoute(route.routeId)?.harnessId : undefined;
  return harnessId ? getHarnessMediaInput(harnessId).maxImagesPerRequest : undefined;
}

function modelLimitedByItsRoute() {
  return listChatModels().find(
    (candidate) =>
      candidate.imageInput?.maxImagesPerRequest === undefined &&
      defaultRouteLimit(candidate.id) !== undefined,
  );
}

afterEach(() => {
  metadataById.mockImplementation(readMetadata);
});

describe('maxImagesPerMessage', () => {
  it('uses a model override before its route limit', () => {
    const model = modelLimitedByItsRoute();
    expect(model).toBeDefined();
    const override = defaultRouteLimit(model!.id)! + 1;
    metadataById.mockImplementation((id) => {
      const metadata = readMetadata(id);
      return metadata && id === model!.id
        ? { ...metadata, imageInput: { maxImagesPerRequest: override } }
        : metadata;
    });

    expect(maxImagesPerMessage(model!.id)).toBe(override);
  });

  it('reads every override the catalogue carries', () => {
    for (const model of listChatModels()) {
      const override = model.imageInput?.maxImagesPerRequest;
      if (override !== undefined) expect(maxImagesPerMessage(model.id)).toBe(override);
    }
  });

  it("reads the limit of the model's default managed route", () => {
    const model = modelLimitedByItsRoute();
    expect(model).toBeDefined();
    expect(maxImagesPerMessage(model!.id)).toBe(defaultRouteLimit(model!.id));
  });

  it('knows no limit for a selection that is not a model', () => {
    expect(maxImagesPerMessage('not-a-registered-model')).toBeNull();
  });
});

describe('imageLimitRefusal', () => {
  const model = listChatModels().find((candidate) => maxImagesPerMessage(candidate.id) !== null)!;
  const limit = maxImagesPerMessage(model.id)!;

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
