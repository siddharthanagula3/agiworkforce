import React from 'react';
import { StyleSheet } from 'react-native';
import { render, waitFor, within } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), navigate: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('lucide-react-native', () => {
  const icon = jest.fn().mockReturnValue(null);
  return new Proxy({}, { get: () => icon });
});

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  cacheDirectory: 'file:///cache/',
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getFreeDiskStorageAsync: jest.fn().mockResolvedValue(12 * 1024 * 1024 * 1024),
  getTotalDiskCapacityAsync: jest.fn().mockResolvedValue(128 * 1024 * 1024 * 1024),
}));

jest.mock('@/storage/installedModels', () => ({
  listInstalledModels: jest.fn().mockResolvedValue([]),
  deleteInstalledModel: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/modelDownload', () => ({
  modelRemovalUnsupportedReason: jest.fn(),
  MODEL_BUSY_REMOVAL_MESSAGE: 'busy',
  deleteDownloadedModel: jest.fn().mockResolvedValue(undefined),
  getModelStorageBytes: jest.fn().mockResolvedValue(1_181_116_006),
}));

jest.mock('@/services/dsarExport', () => ({
  exportAllUserData: jest.fn(),
  wipeAllLocalData: jest.fn(),
}));

jest.mock('@/src/features/settings/data-controls/localDataSnapshot', () => ({
  LocalExportAuthorityError: class LocalExportAuthorityError extends Error {},
  buildLocalDataExportSnapshot: jest.fn().mockReturnValue({}),
  resetLocalInMemoryState: jest.fn(),
}));

jest.mock('@/src/features/settings/storageUsage', () => ({
  getDirectorySizeBytes: jest.fn().mockResolvedValue(0),
}));

jest.mock('@/src/features/settings/StorageScopeNotice', () => ({
  StorageScopeNotice: () => null,
}));

import { TextScaleContext } from '@/components/ui/textScale';
import { ROW_LABEL_TEXT_SCALE_LIMIT, STACKED_ROW_TEXT_SCALE } from '@/src/ui/theme/tokens';
import StorageManagerScreen from '@/app/(app)/settings/storage';

const LARGEST_ACCESSIBILITY_SCALE = 3.571;
const ROWS = [
  { label: 'Downloaded models (estimated)', valueTestID: 'storage-model-bytes' },
  { label: 'Cache', valueTestID: 'storage-cache-bytes' },
  { label: 'Free space', valueTestID: 'storage-free-space' },
];

async function renderAtScale(scale: number) {
  const screen = render(
    <TextScaleContext.Provider value={scale}>
      <StorageManagerScreen />
    </TextScaleContext.Provider>,
  );
  await waitFor(() => expect(screen.getByTestId('storage-free-space')).toBeTruthy());
  return screen;
}

describe('the On This Device rows in Storage at every text size', () => {
  it.each(ROWS)(
    'puts the $label value below its label at the largest text size',
    async ({ label, valueTestID }) => {
      const screen = await renderAtScale(LARGEST_ACCESSIBILITY_SCALE);
      const row = screen.getByTestId(`${valueTestID}-row`);
      const labelText = screen.getByText(label);
      const valueText = screen.getByTestId(valueTestID);

      expect(row.props.className ?? '').not.toContain('flex-row');
      expect(StyleSheet.flatten(row.props.style).flexDirection).not.toBe('row');
      expect(within(row).getAllByText(/./)).toEqual([labelText, valueText]);
      expect(labelText.props.maxFontSizeMultiplier).toBe(ROW_LABEL_TEXT_SCALE_LIMIT);
    },
  );

  it.each(ROWS)(
    'keeps the $label value beside its label with a gap at the default size',
    async ({ label, valueTestID }) => {
      const screen = await renderAtScale(1);
      const row = screen.getByTestId(`${valueTestID}-row`);

      expect(row.props.className).toContain('flex-row');
      expect(StyleSheet.flatten(row.props.style).gap).toBeGreaterThan(0);
      expect(StyleSheet.flatten(screen.getByText(label).props.style).flexShrink).toBe(1);
      expect(StyleSheet.flatten(screen.getByTestId(valueTestID).props.style).flexShrink).toBe(0);
    },
  );

  it('switches to the stacked rows exactly at the shared large text threshold', async () => {
    const below = await renderAtScale(STACKED_ROW_TEXT_SCALE - 0.01);
    expect(below.getByTestId('storage-free-space-row').props.className).toContain('flex-row');
    below.unmount();

    const at = await renderAtScale(STACKED_ROW_TEXT_SCALE);
    expect(at.getByTestId('storage-free-space-row').props.className ?? '').not.toContain(
      'flex-row',
    );
  });
});
