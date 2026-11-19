import React from 'react';
import { render } from '@testing-library/react-native';
import { ModelRow } from '@/src/features/model-picker/components/ModelRow';
import type { ModelDef } from '@/src/features/model-picker/service';

jest.mock('@/services/modelDownload', () => ({
  downloadModel: jest.fn(),
  cancelDownload: jest.fn(),
  assertDownloadAllowed: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const icon = ({ testID }: { testID?: string }) => (testID ? <View testID={testID} /> : null);
  return new Proxy({}, { get: () => icon });
});

const CLOUD_MODEL: ModelDef = {
  id: 'fixture-cloud-model',
  name: 'Fixture Cloud',
  provider: 'anthropic',
  providerLabel: 'Anthropic',
  contextWindow: 0,
  maxOutput: 1024,
  supportsVision: false,
  supportsThinking: false,
  tier: 'standard',
  surface: 'cloud_managed',
  availability: 'available',
  runtimeLabel: 'AGI Cloud',
  detailLabel: 'Anthropic provider',
};

function renderRow(model: ModelDef, nested = false) {
  return render(
    <ModelRow
      model={model}
      nested={nested}
      isSelected={false}
      isFavorite={false}
      isExpanded={false}
      thinkingEnabled={false}
      installStatus={{ status: 'ready', progress: 1 } as never}
      onSelect={jest.fn()}
      onLockedPress={jest.fn()}
      onToggleFavorite={jest.fn()}
      onToggleThinking={jest.fn()}
    />,
  );
}

describe('model picker rows identify the provider', () => {
  it("draws the provider's mark for a provider that has one, in place of its name", () => {
    const { getByTestId, queryByTestId, queryByText, getByLabelText } = renderRow(CLOUD_MODEL);

    expect(getByTestId('provider-mark-anthropic', { includeHiddenElements: true })).toBeTruthy();
    expect(queryByTestId('model-row-icon-cloud')).toBeNull();
    expect(queryByText('Anthropic')).toBeNull();
    expect(getByLabelText(/^Fixture Cloud/)).toBeTruthy();
  });

  it('names a provider that has no mark in text beside a generic icon', () => {
    const { getByTestId, getByText } = renderRow({
      ...CLOUD_MODEL,
      provider: 'fixture-provider',
      providerLabel: 'Fixture Provider',
    });

    expect(getByTestId('model-row-icon-cloud')).toBeTruthy();
    expect(getByText('Fixture Provider')).toBeTruthy();
  });

  it('prints nothing else about the model', () => {
    const { queryByText, queryByLabelText } = renderRow({
      ...CLOUD_MODEL,
      contextWindow: 1_000_000,
      description: 'Best for coding',
    });

    expect(queryByText('Best for coding')).toBeNull();
    expect(queryByText('Anthropic provider')).toBeNull();
    expect(queryByText(/context/)).toBeNull();
    expect(queryByLabelText(/^Accepts /)).toBeNull();
  });

  it('leaves the mark to the row above inside a dropdown', () => {
    const { queryByTestId, queryByText, getByText } = renderRow(CLOUD_MODEL, true);

    expect(getByText('Fixture Cloud')).toBeTruthy();
    expect(queryByTestId('provider-mark-anthropic', { includeHiddenElements: true })).toBeNull();
    expect(queryByTestId('model-row-icon-cloud')).toBeNull();
    expect(queryByText('Anthropic')).toBeNull();
  });
});
