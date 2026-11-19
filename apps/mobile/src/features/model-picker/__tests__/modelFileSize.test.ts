import { Alert } from 'react-native';

import { confirmModelDownload } from '../downloadConfirmation';
import { formatModelFileSize } from '../service';

describe('model file size', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    [0, 'Built in'],
    [648_917_376, '618.9 MB'],
    [4_294_967_296, '4 GB'],
    [12_884_901_888, '12 GB'],
  ])('reads %d bytes as %s on the picker row', (bytes, label) => {
    expect(formatModelFileSize(bytes)).toBe(label);
  });

  it.each([648_917_376, 4_294_967_296])(
    'prints the same size on the row and in the download confirmation for %d bytes',
    async (bytes) => {
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

      void confirmModelDownload({ name: 'Local model', fileSizeBytes: bytes }, false);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(alert).toHaveBeenCalledTimes(1);
      const message = alert.mock.calls[0]?.[1] as string;
      expect(message).toContain(`It is ${formatModelFileSize(bytes)}.`);
    },
  );
});
