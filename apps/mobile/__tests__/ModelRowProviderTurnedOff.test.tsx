import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { isChineseHqProvider } from '@agiworkforce/compliance';
import { getModelMetadataById } from '@agiworkforce/types';
import { ModelRow } from '@/src/features/model-picker/components/ModelRow';
import type { ModelDef } from '@/src/features/model-picker/service';
import { requireMobileCloudModel } from '../test-utils/modelFixtures';

const mockAccepted = new Set<string>();

jest.mock('@/services/complianceLedger', () => ({
  mmkvRoutingConsentLedger: {
    getNamedProviderConsent: (providerId: string) =>
      mockAccepted.has(providerId)
        ? {
            providerId,
            accepted: true,
            acceptedAt: '2026-11-15T00:00:00.000Z',
            disclosureVersion: 'fixture',
            surface: 'mobile',
          }
        : null,
  },
}));

jest.mock('@/services/modelDownload', () => ({
  downloadModel: jest.fn(),
  excludeModelFilesFromBackup: jest.fn().mockResolvedValue(undefined),
  cancelDownload: jest.fn(),
  assertDownloadAllowed: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('lucide-react-native', () => {
  const { View } = jest.requireActual('react-native');
  const icon = ({ testID }: { testID?: string }) => (testID ? <View testID={testID} /> : null);
  return new Proxy({}, { get: () => icon });
});

const consentModel = requireMobileCloudModel(
  (model) => isChineseHqProvider(getModelMetadataById(model.id)?.provider ?? ''),
  'Mobile Cloud model from a provider that needs its own consent',
);
const otherModel = requireMobileCloudModel(
  (model) => !isChineseHqProvider(getModelMetadataById(model.id)?.provider ?? ''),
  'Mobile Cloud model that needs no provider consent',
);
const consentProvider = getModelMetadataById(consentModel.id)!.provider;

function rowFor(id: string, name: string): ModelDef {
  return {
    id,
    name,
    provider: getModelMetadataById(id)!.provider,
    providerLabel: 'Provider',
    contextWindow: 0,
    maxOutput: 1024,
    supportsVision: false,
    supportsThinking: false,
    tier: 'standard',
    surface: 'cloud_managed',
    availability: 'available',
    runtimeLabel: 'AGI Cloud',
    detailLabel: 'Provider',
  };
}

function renderRow(model: ModelDef, onSelect = jest.fn()) {
  return render(
    <ModelRow
      model={model}
      isSelected={false}
      isFavorite={false}
      isExpanded={false}
      thinkingEnabled={false}
      installStatus={{ status: 'ready', progress: 1 } as never}
      onSelect={onSelect}
      onLockedPress={jest.fn()}
      onToggleFavorite={jest.fn()}
      onToggleThinking={jest.fn()}
    />,
  );
}

describe('a model whose provider is turned off for the account', () => {
  beforeEach(() => mockAccepted.clear());

  it('says so in the picker before the send is refused, and can still be picked', () => {
    const onSelect = jest.fn();
    const view = renderRow(rowFor(consentModel.id, 'Consent model'), onSelect);

    expect(view.getByTestId('model-row-provider-turned-off')).toHaveTextContent(
      'Turned off for your account. You can turn it on when you send.',
    );
    expect(view.getByLabelText(/Consent model, turned off for your account/)).toBeTruthy();

    fireEvent.press(view.getByTestId(`model-row-${consentModel.id}`));
    expect(onSelect).toHaveBeenCalledWith(consentModel.id);
  });

  it('shows no note once the provider is turned on, or for a provider that needs no consent', () => {
    mockAccepted.add(consentProvider);
    expect(
      renderRow(rowFor(consentModel.id, 'Consent model')).queryByTestId(
        'model-row-provider-turned-off',
      ),
    ).toBeNull();

    mockAccepted.clear();
    expect(
      renderRow(rowFor(otherModel.id, 'Other model')).queryByTestId(
        'model-row-provider-turned-off',
      ),
    ).toBeNull();
  });
});
