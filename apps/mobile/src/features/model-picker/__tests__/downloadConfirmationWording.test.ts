import { Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { confirmModelDownload } from '../downloadConfirmation';

const MODEL = { name: 'Local model', fileSizeBytes: 648_917_376 };

async function messageFor(connection: 'wifi' | 'cellular', allowCellular: boolean) {
  jest
    .mocked(NetInfo.fetch)
    .mockResolvedValueOnce({ type: connection, isConnected: true } as never);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  void confirmModelDownload(MODEL, allowCellular);
  await new Promise((resolve) => setImmediate(resolve));
  return alert.mock.calls[0]?.[1] as string;
}

describe('model download confirmation wording', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('names the device, not a phone, for the storage a download uses', async () => {
    const message = await messageFor('wifi', false);

    expect(message).toContain('storage on this device.');
    expect(message).not.toMatch(/phone/i);
  });

  it('names the device when the download would use mobile data', async () => {
    const message = await messageFor('cellular', true);

    expect(message).toContain('Your device is on mobile data');
    expect(message).not.toMatch(/phone/i);
  });

  it('names the device when Wi-Fi is needed first', async () => {
    const message = await messageFor('cellular', false);

    expect(message).toContain('your device is on mobile data');
    expect(message).not.toMatch(/phone/i);
  });
});
