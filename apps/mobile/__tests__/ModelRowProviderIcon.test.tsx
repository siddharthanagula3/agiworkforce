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

function renderRow(model: ModelDef) {
  return render(
    <ModelRow
      model={model}
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

describe('model picker rows name the provider in text, without a brand logo', () => {
  it('draws one generic icon for a third-party provider and names it in text', () => {
    const { getByTestId, getByText, getByLabelText } = renderRow(CLOUD_MODEL);

    expect(getByTestId('model-row-icon-cloud')).toBeTruthy();
    expect(getByText('Anthropic provider')).toBeTruthy();
    expect(getByLabelText(/^Fixture Cloud/)).toBeTruthy();
  });

  it('uses the same generic icon whichever provider serves the model', () => {
    const { getByTestId } = renderRow({
      ...CLOUD_MODEL,
      provider: 'openai',
      detailLabel: 'OpenAI provider',
    });

    expect(getByTestId('model-row-icon-cloud')).toBeTruthy();
  });
});
