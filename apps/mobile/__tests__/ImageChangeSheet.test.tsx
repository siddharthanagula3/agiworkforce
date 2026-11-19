import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { supportsManagedMediaImageEdit } from '@agiworkforce/cloud-contracts';
import { getImageAspectOptionsForModel } from '@agiworkforce/types';

const mockReadGeneratedImageBase64 = jest.fn();
jest.mock('@/services/fileCreation', () => ({
  readGeneratedImageBase64: (...args: unknown[]) => mockReadGeneratedImageBase64(...args),
}));

jest.mock('lucide-react-native', () => ({
  X: jest.fn().mockReturnValue(null),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import {
  IMAGE_TOO_LARGE_TO_CHANGE,
  ImageChangeSheet,
  SHAPE_NOTE,
} from '../src/features/image/components/ImageChangeSheet';
import { requireCatalogModel } from '../test-utils/modelFixtures';

const EDITING_IMAGE_MODEL = requireCatalogModel(
  (model) => model.modelType === 'image' && supportsManagedMediaImageEdit(model.imageApi),
  'image model that edits images',
).id;

const SHAPES = getImageAspectOptionsForModel(EDITING_IMAGE_MODEL);
const CURRENT = SHAPES[0]!;
const OTHER = SHAPES[1]!;

function renderSheet(overrides: Partial<Parameters<typeof ImageChangeSheet>[0]> = {}) {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();
  const view = render(
    <ImageChangeSheet
      imagePath="/api/files/00000000-0000-0000-0000-000000000001"
      imagePrompt="A harbour at dusk"
      model={EDITING_IMAGE_MODEL}
      aspectRatio={CURRENT.id}
      onCancel={onCancel}
      onSubmit={onSubmit}
      {...overrides}
    />,
  );
  return { ...view, onSubmit, onCancel };
}

describe('ImageChangeSheet', () => {
  beforeEach(() => {
    mockReadGeneratedImageBase64.mockReset();
    mockReadGeneratedImageBase64.mockResolvedValue({
      base64: 'c291cmNl',
      contentType: 'image/png',
    });
  });

  it('holds Change until a change is described', () => {
    const { getByLabelText } = renderSheet();

    expect(getByLabelText('Change the image')).toBeDisabled();
    fireEvent.changeText(getByLabelText('Describe the change'), 'make it snowy');
    expect(getByLabelText('Change the image')).toBeEnabled();
  });

  it('submits the described change with the image bytes and its shape', async () => {
    const { getByLabelText, onSubmit } = renderSheet();

    fireEvent.changeText(getByLabelText('Describe the change'), ' make it snowy ');
    fireEvent.press(getByLabelText('Change the image'));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        operation: 'edit',
        prompt: 'A harbour at dusk. Edit: make it snowy',
        sourceBase64: 'c291cmNl',
        aspectRatio: CURRENT.id,
      }),
    );
    expect(mockReadGeneratedImageBase64).toHaveBeenCalledWith(
      '/api/files/00000000-0000-0000-0000-000000000001',
    );
  });

  it('makes a variation from the image description with no typing', async () => {
    const { getByLabelText, onSubmit } = renderSheet();

    fireEvent.press(getByLabelText('Make a variation'));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        operation: 'variation',
        prompt: 'A harbour at dusk',
        sourceBase64: 'c291cmNl',
        aspectRatio: CURRENT.id,
      }),
    );
  });

  it('offers the other shapes the model makes and says they start a new image', () => {
    const { getByLabelText, getByText, queryByLabelText, onSubmit } = renderSheet();

    expect(getByText(SHAPE_NOTE)).toBeTruthy();
    expect(queryByLabelText(`Make it ${CURRENT.label}`)).toBeNull();
    fireEvent.press(getByLabelText(`Make it ${OTHER.label}`));

    expect(onSubmit).toHaveBeenCalledWith({
      operation: 'reshape',
      prompt: 'A harbour at dusk',
      aspectRatio: OTHER.id,
    });
    expect(mockReadGeneratedImageBase64).not.toHaveBeenCalled();
  });

  it('shows no shapes when the image has no description to make a new one from', () => {
    const { queryByText } = renderSheet({ imagePrompt: undefined });

    expect(queryByText(SHAPE_NOTE)).toBeNull();
  });

  it('says so, and sends nothing, when the image cannot be read', async () => {
    mockReadGeneratedImageBase64.mockRejectedValue(
      new Error('Only saved AGI Cloud images can be edited.'),
    );
    const { getByLabelText, findByRole, onSubmit } = renderSheet();

    fireEvent.press(getByLabelText('Make a variation'));

    expect(await findByRole('alert')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(getByLabelText('Make a variation')).toBeEnabled();
  });

  it('refuses an image too large to send', async () => {
    mockReadGeneratedImageBase64.mockResolvedValue({
      base64: 'A'.repeat(12_000_001),
      contentType: 'image/png',
    });
    const { getByLabelText, findByText, onSubmit } = renderSheet();

    fireEvent.press(getByLabelText('Make a variation'));

    expect(await findByText(IMAGE_TOO_LARGE_TO_CHANGE)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('cancels from the close control', () => {
    const { getByLabelText, onCancel } = renderSheet();

    fireEvent.press(getByLabelText('Cancel change'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
