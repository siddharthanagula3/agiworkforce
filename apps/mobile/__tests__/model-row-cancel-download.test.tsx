import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ModelRow } from '@/src/features/model-picker/components/ModelRow';
import { useModelInstallStore } from '@/src/features/model-picker/installStore';
import type { ModelDef } from '@/src/features/model-picker/service';

jest.mock('@/services/modelDownload', () => ({
  downloadModel: jest.fn(),
  cancelDownload: jest.fn(),
  assertDownloadAllowed: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: () => icon });
});

const MODEL: ModelDef = {
  id: 'local-fixture',
  name: 'Fixture Local',
  provider: 'local',
  providerLabel: 'On device',
  contextWindow: 4096,
  maxOutput: 1024,
  supportsVision: false,
  supportsThinking: false,
  tier: 'standard',
  surface: 'local',
  availability: 'download_required',
  runtimeLabel: 'llama.rn',
  detailLabel: 'llama.rn',
  fileSizeBytes: 1_000_000,
  license: 'Apache-2.0',
};

function renderRow(installStatus: { status: string; progress: number; error?: string }) {
  return render(
    <ModelRow
      model={MODEL}
      isSelected={false}
      isFavorite={false}
      isExpanded={false}
      thinkingEnabled={false}
      installStatus={installStatus as never}
      onSelect={jest.fn()}
      onLockedPress={jest.fn()}
      onToggleFavorite={jest.fn()}
      onToggleThinking={jest.fn()}
    />,
  );
}

describe('a download in progress is cancellable from the row', () => {
  beforeEach(() => {
    useModelInstallStore.setState({
      installedModelIds: [],
      readySystemModelIds: [],
      totalRAMMB: 8192,
      allowCellularDownloads: false,
      jobs: { [MODEL.id]: { status: 'downloading', progress: 0.3 } },
    });
  });

  it('offers a cancel control while downloading', () => {
    const { getByTestId } = renderRow({ status: 'downloading', progress: 0.3 });
    expect(getByTestId(`model-cancel-${MODEL.id}`)).toBeTruthy();
  });

  it('clears the job when the cancel control is pressed', () => {
    const { getByTestId } = renderRow({ status: 'downloading', progress: 0.3 });
    fireEvent.press(getByTestId(`model-cancel-${MODEL.id}`));
    expect(useModelInstallStore.getState().jobs[MODEL.id]).toBeUndefined();
  });

  it('offers no cancel control when nothing is downloading', () => {
    const { queryByTestId } = renderRow({ status: 'download_required', progress: 0 });
    expect(queryByTestId(`model-cancel-${MODEL.id}`)).toBeNull();
  });

  it('shows the real failure cause instead of truncating it to one line', () => {
    const cause = 'This model needs 6.3 GB free and this device has 1.1 GB. Free up space.';
    const { getByText } = renderRow({ status: 'failed', progress: 0, error: cause });
    expect(getByText(cause).props.numberOfLines).toBe(3);
  });
});
