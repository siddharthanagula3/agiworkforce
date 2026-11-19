import { fireEvent, render, screen } from '@testing-library/react-native';
import { SYNTHETIC_CLOUD_MODEL_ID } from '@/test-utils/modelFixtures';

const mockCanAccess = jest.fn();
jest.mock('@/src/features/model-picker/service', () => ({
  ...jest.requireActual('@/src/features/model-picker/service'),
  canAccessCloudModelForTier: (...args: unknown[]) => mockCanAccess(...args),
}));
jest.mock('@/lib/models', () => ({
  ...jest.requireActual('@/lib/models'),
  getModelById: (id: string) => ({ id, name: 'Fixture Cloud Model' }),
}));

import { ModelTierWarningBanner } from '@/src/features/chat/components/ModelTierWarningBanner';
import { useModelStore } from '@/src/features/model-picker/store';

describe('the notice for a model the account cannot use', () => {
  beforeEach(() => {
    mockCanAccess.mockReturnValue(false);
    useModelStore.setState({ selectedModel: SYNTHETIC_CLOUD_MODEL_ID });
  });

  it('opens the model picker from the notice', () => {
    const onChooseModel = jest.fn();
    render(<ModelTierWarningBanner onChooseModel={onChooseModel} />);

    expect(
      screen.getByText(
        'Fixture Cloud Model is not included in your plan. Choose an available model.',
      ),
    ).toBeOnTheScreen();
    const choose = screen.getByRole('button', { name: 'Choose a model' });
    expect(choose).toHaveStyle({ minHeight: 44 });
    fireEvent.press(choose);

    expect(onChooseModel).toHaveBeenCalledTimes(1);
  });

  it('offers no control when the screen gives it nowhere to go', () => {
    render(<ModelTierWarningBanner />);

    expect(screen.queryByRole('button', { name: 'Choose a model' })).toBeNull();
  });

  it('shows nothing when the model is available', () => {
    mockCanAccess.mockReturnValue(true);
    render(<ModelTierWarningBanner onChooseModel={jest.fn()} />);

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
