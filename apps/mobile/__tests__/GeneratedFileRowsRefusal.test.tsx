/* eslint-disable @typescript-eslint/no-require-imports */
const mockDownloadGeneratedFile = jest.fn();
const mockShareFile = jest.fn();
jest.mock('@/services/fileCreation', () => ({
  downloadGeneratedFile: (...args: unknown[]) => mockDownloadGeneratedFile(...args),
  shareFile: (...args: unknown[]) => mockShareFile(...args),
}));
jest.mock('@/src/features/auth/services/accountScopedUiState', () => ({
  captureAccountScopedUiState: () => ({ scope: 'cloud', account: { ownerId: 'user-1', epoch: 1 } }),
  isAccountScopedUiStateOwned: () => true,
}));
jest.mock('lucide-react-native', () => {
  const RN = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) =>
        name === '__esModule' ? true : (props: Record<string, unknown>) => <RN.View {...props} />,
    },
  );
});

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { ApiHttpError } from '@/services/apiErrors';
import { CloudRunFilesSection } from '@/src/features/tasks/components/CloudRunFilesSection';
import { VoiceToolFiles } from '@/src/features/voice/components/VoiceToolFiles';

const TOO_LARGE = 'This file is too large to open on this device.';
const DOWNLOAD_FALLBACK = 'The file could not be downloaded.';

function tooLarge(): ApiHttpError {
  return new ApiHttpError(TOO_LARGE, 413, 'file_too_large');
}

async function openRun(): Promise<void> {
  render(
    <CloudRunFilesSection
      files={[
        {
          artifactId: 'file-1',
          name: 'footage.mov',
          mimeType: 'video/quicktime',
          uri: '/api/files/file-1',
        },
      ]}
    />,
  );
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Open or share footage.mov'));
  });
}

async function openVoice(): Promise<void> {
  render(<VoiceToolFiles files={[{ name: 'notes.pdf', uri: '/api/files/file-2' }]} />);
  await act(async () => {
    fireEvent.press(screen.getByLabelText('Open notes.pdf'));
  });
}

describe('generated file rows when the file cannot be fetched', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => alert.mockRestore());

  it('a run file row says a file above the download limit is too large', async () => {
    mockDownloadGeneratedFile.mockRejectedValueOnce(tooLarge());
    await openRun();
    expect(alert).toHaveBeenCalledWith('Could not open this file', TOO_LARGE);
    expect(mockShareFile).not.toHaveBeenCalled();
  });

  it('a voice file row says a file above the download limit is too large', async () => {
    mockDownloadGeneratedFile.mockRejectedValueOnce(tooLarge());
    await openVoice();
    expect(alert).toHaveBeenCalledWith('Could not open this file', TOO_LARGE);
    expect(mockShareFile).not.toHaveBeenCalled();
  });

  it('both rows keep the download copy for a failure with nothing more to say', async () => {
    mockDownloadGeneratedFile.mockRejectedValue(new Error('disk full'));
    await openRun();
    await openVoice();
    expect(alert).toHaveBeenNthCalledWith(1, 'Could not open this file', DOWNLOAD_FALLBACK);
    expect(alert).toHaveBeenNthCalledWith(2, 'Could not open this file', DOWNLOAD_FALLBACK);
  });
});
