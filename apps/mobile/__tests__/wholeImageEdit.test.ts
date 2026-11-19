import { supportsManagedMediaImageEdit } from '@agiworkforce/cloud-contracts';
import { getImageAspectOptionsForModel } from '@agiworkforce/types';
import {
  VARIATION_DISPLAY_TEXT,
  VARIATION_FALLBACK_PROMPT,
  imageShapeOptions,
  variationPrompt,
  wholeImageChangePrompt,
  wholeImageEditRequest,
} from '../src/features/image/wholeImageEdit';
import { requireCatalogModel } from '../test-utils/modelFixtures';

const EDITING_IMAGE_MODEL = requireCatalogModel(
  (model) => model.modelType === 'image' && supportsManagedMediaImageEdit(model.imageApi),
  'image model that edits images',
).id;

const ownership = { conversationId: 'conversation-1', ownerId: 'owner-1', model: 'model-1' };

describe('wholeImageChangePrompt', () => {
  it('puts the change after the image description, as the web editor does', () => {
    expect(wholeImageChangePrompt('A harbour at dusk.', '  make it snowy ')).toBe(
      'A harbour at dusk. Edit: make it snowy',
    );
  });

  it('uses the change alone when the description is not known', () => {
    expect(wholeImageChangePrompt(undefined, ' make it snowy ')).toBe('make it snowy');
    expect(wholeImageChangePrompt('   ', 'make it snowy')).toBe('make it snowy');
  });
});

describe('variationPrompt', () => {
  it('repeats the image description', () => {
    expect(variationPrompt(' A harbour at dusk ')).toBe('A harbour at dusk');
  });

  it('never sends an empty prompt', () => {
    expect(variationPrompt(undefined)).toBe(VARIATION_FALLBACK_PROMPT);
  });
});

describe('imageShapeOptions', () => {
  it('offers the shapes the model makes except the one the image already has', () => {
    const all = getImageAspectOptionsForModel(EDITING_IMAGE_MODEL).map((option) => option.id);
    const current = all[0]!;

    const offered = imageShapeOptions(EDITING_IMAGE_MODEL, current).map((option) => option.id);

    expect(all.length).toBeGreaterThan(1);
    expect(offered).toEqual(all.filter((id) => id !== current));
  });

  it('offers nothing for a model the catalog does not know', () => {
    expect(imageShapeOptions('unknown-model', undefined)).toEqual([]);
    expect(imageShapeOptions(undefined, undefined)).toEqual([]);
  });
});

describe('wholeImageEditRequest', () => {
  it('sends a described change as an edit of the image, keeping its shape', () => {
    expect(
      wholeImageEditRequest({
        ...ownership,
        edit: {
          operation: 'edit',
          prompt: 'A harbour. Edit: snowy',
          sourceBase64: 'c291cmNl',
          aspectRatio: '3:2',
        },
      }),
    ).toEqual({
      ...ownership,
      displayText: 'A harbour. Edit: snowy',
      prompt: 'A harbour. Edit: snowy',
      operation: 'edit',
      sourceImageBase64: 'c291cmNl',
      aspectRatio: '3:2',
    });
  });

  it('leaves the shape out when the image has none the service takes', () => {
    const request = wholeImageEditRequest({
      ...ownership,
      edit: {
        operation: 'variation',
        prompt: 'A harbour',
        sourceBase64: 'c291cmNl',
        aspectRatio: 'auto',
      },
    });

    expect(request).toEqual({
      ...ownership,
      displayText: VARIATION_DISPLAY_TEXT,
      prompt: 'A harbour',
      operation: 'variation',
      sourceImageBase64: 'c291cmNl',
    });
  });

  it('sends a new shape as a plain generation that Retry replays as written', () => {
    expect(
      wholeImageEditRequest({
        ...ownership,
        edit: { operation: 'reshape', prompt: 'A harbour', aspectRatio: '3:2' },
      }),
    ).toEqual({
      ...ownership,
      displayText: 'Make it 3:2',
      prompt: 'A harbour',
      aspectRatio: '3:2',
      replayOnRetry: true,
    });
  });
});
