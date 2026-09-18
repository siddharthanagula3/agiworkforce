/* eslint-disable @typescript-eslint/no-require-imports */

import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return new Proxy(
    {},
    {
      get: (_target, name) => {
        if (name === '__esModule') return true;
        return (props: Record<string, unknown>) => (
          <View testID={`icon-${String(name)}`} {...props} />
        );
      },
    },
  );
});

jest.mock('expo-image', () => {
  const { View } = require('react-native');
  return { Image: View };
});

jest.mock('../src/ui/theme', () => ({
  useThemeColors: () => ({
    surfaceBase: '#111',
    surfaceOverlay: '#222',
    border: '#333',
    textPrimary: '#fff',
    textSecondary: '#ccc',
    textMuted: '#888',
    agentActive: '#1e90ff',
    agentError: '#f87171',
    progressTrack: '#333',
    warningSurface: '#332200',
    warningBorder: '#664400',
  }),
}));

jest.mock('@/services/api', () => ({ api: { uploadFile: jest.fn() } }));

import { api } from '@/services/api';
import {
  AttachmentPreview,
  type Attachment,
} from '../src/features/chat/components/AttachmentPreview';
import {
  isResumable,
  uploadStatusLabel,
  useUploadLifecycleStore,
} from '../src/features/chat/upload/uploadLifecycle';
import {
  unsentAttachmentMessage,
  uploadWithRetry,
} from '../src/features/chat/upload/uploadAttachment';

const mockUploadFile = api.uploadFile as jest.Mock;

const NOTES_TXT: Attachment = {
  id: 'att-txt',
  uri: 'file:///cache/notes.txt',
  mimeType: 'text/plain',
  fileName: 'notes.txt',
  fileSize: 4096,
};

const ROWS_CSV: Attachment = {
  id: 'att-csv',
  uri: 'file:///cache/rows.csv',
  mimeType: 'text/csv',
  fileName: 'rows.csv',
  fileSize: 8192,
};

function uploadResultFor(attachment: Attachment) {
  return {
    id: `asset-${attachment.id}`,
    url: `https://cdn.example/${attachment.fileName}`,
    mimeType: attachment.mimeType,
    name: attachment.fileName,
    byteCount: attachment.fileSize,
  };
}

function fileInputFor(attachment: Attachment) {
  return { uri: attachment.uri, name: attachment.fileName, type: attachment.mimeType };
}

function abortError(): Error {
  const error = new Error('Attachment upload aborted');
  error.name = 'AbortError';
  return error;
}

function entry(id: string) {
  return useUploadLifecycleStore.getState().uploads[id];
}

beforeEach(() => {
  mockUploadFile.mockReset();
  useUploadLifecycleStore.getState().reset();
  jest.useRealTimers();
});

describe('upload progress', () => {
  it.each([
    ['TXT', NOTES_TXT],
    ['CSV', ROWS_CSV],
  ])('reports %s progress while the bytes go out and settles at done', async (_label, file) => {
    mockUploadFile.mockImplementation(
      async (_file: unknown, options: { onProgress: (sent: number, total: number) => void }) => {
        options.onProgress(0, 100);
        expect(entry(file.id)?.progress).toBe(0);
        options.onProgress(50, 100);
        expect(entry(file.id)?.progress).toBe(0.5);
        return uploadResultFor(file);
      },
    );

    const result = await uploadWithRetry(fileInputFor(file), file.fileName, file.id);

    expect(result).toEqual(uploadResultFor(file));
    expect(entry(file.id)).toMatchObject({ phase: 'done', progress: 1, attempt: 1 });
    expect(uploadStatusLabel(entry(file.id))).toBe('Uploaded');
  });

  it('never lets a late or lower reading walk the bar backwards', () => {
    const store = useUploadLifecycleStore.getState();
    store.begin(NOTES_TXT.id);
    store.reportProgress(NOTES_TXT.id, 80, 100);
    store.reportProgress(NOTES_TXT.id, 30, 100);
    expect(entry(NOTES_TXT.id)?.progress).toBe(0.8);
    expect(uploadStatusLabel(entry(NOTES_TXT.id))).toBe('Uploading 80%');
  });

  it('renders a progress bar carrying the percentage for assistive technology', () => {
    useUploadLifecycleStore.getState().begin(ROWS_CSV.id);
    useUploadLifecycleStore.getState().reportProgress(ROWS_CSV.id, 25, 100);

    const { getByTestId } = render(
      <AttachmentPreview attachments={[ROWS_CSV]} onRemove={jest.fn()} />,
    );

    const bar = getByTestId(`attachment-progress-${ROWS_CSV.id}`);
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 25 });
    expect(bar.props.accessibilityLabel).toBe('rows.csv, Uploading 25%');
  });
});

describe('upload cancellation', () => {
  it('aborts the in-flight request and does not retry a canceled TXT upload', async () => {
    mockUploadFile.mockImplementation(async (_file: unknown, options: { signal: AbortSignal }) => {
      useUploadLifecycleStore.getState().cancel(NOTES_TXT.id);
      expect(options.signal.aborted).toBe(true);
      throw abortError();
    });

    const result = await uploadWithRetry(fileInputFor(NOTES_TXT), NOTES_TXT.fileName, NOTES_TXT.id);

    expect(result).toBeNull();
    expect(mockUploadFile).toHaveBeenCalledTimes(1);
    expect(entry(NOTES_TXT.id)?.phase).toBe('canceled');
    expect(uploadStatusLabel(entry(NOTES_TXT.id))).toBe('Upload canceled');
  });

  it('turns the chip close control into a cancel while the CSV is uploading', () => {
    useUploadLifecycleStore.getState().begin(ROWS_CSV.id);

    const { getByTestId } = render(
      <AttachmentPreview attachments={[ROWS_CSV]} onRemove={jest.fn()} />,
    );

    const control = getByTestId(`attachment-cancel-${ROWS_CSV.id}`);
    expect(control.props.accessibilityLabel).toBe('Cancel upload of rows.csv');
  });

  it('leaves a settled upload alone so a late cancel cannot undo a finished send', () => {
    const store = useUploadLifecycleStore.getState();
    store.begin(NOTES_TXT.id);
    store.settle(NOTES_TXT.id, 'done');
    store.cancel(NOTES_TXT.id);
    expect(entry(NOTES_TXT.id)?.phase).toBe('done');
  });
});

describe('background transition', () => {
  it('marks every in-flight upload interrupted and names the reason', () => {
    const store = useUploadLifecycleStore.getState();
    store.begin(NOTES_TXT.id);
    store.begin(ROWS_CSV.id);
    store.settle(ROWS_CSV.id, 'done');

    store.markBackgrounded();

    expect(entry(NOTES_TXT.id)?.interrupted).toBe(true);
    expect(entry(ROWS_CSV.id)?.interrupted).toBe(false);

    store.settle(NOTES_TXT.id, 'failed');
    expect(uploadStatusLabel(entry(NOTES_TXT.id))).toBe('Upload stopped in the background');
  });
});

describe('resume and retry', () => {
  it('retries a transient CSV failure and keeps the attempt count', async () => {
    jest.useFakeTimers();
    mockUploadFile
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValueOnce(uploadResultFor(ROWS_CSV));

    const pending = uploadWithRetry(fileInputFor(ROWS_CSV), ROWS_CSV.fileName, ROWS_CSV.id);
    await jest.advanceTimersByTimeAsync(1000);
    const result = await pending;

    expect(result).toEqual(uploadResultFor(ROWS_CSV));
    expect(entry(ROWS_CSV.id)).toMatchObject({ phase: 'done', attempt: 2 });
  });

  it('gives up after the retry budget and leaves the TXT resumable with the reason', async () => {
    jest.useFakeTimers();
    mockUploadFile.mockRejectedValue(new Error('Network request failed'));

    const pending = uploadWithRetry(fileInputFor(NOTES_TXT), NOTES_TXT.fileName, NOTES_TXT.id);
    await jest.advanceTimersByTimeAsync(3000);
    const result = await pending;

    expect(result).toBeNull();
    expect(mockUploadFile).toHaveBeenCalledTimes(3);
    expect(entry(NOTES_TXT.id)).toMatchObject({ phase: 'failed', error: 'Network request failed' });
    expect(isResumable(entry(NOTES_TXT.id))).toBe(true);
    expect(uploadStatusLabel(entry(NOTES_TXT.id))).toBe('Upload failed');
  });

  it('stops on an expired session rather than burning the budget on a retry that cannot work', async () => {
    mockUploadFile.mockRejectedValue(new Error('Upload failed: session expired.'));

    await expect(
      uploadWithRetry(fileInputFor(NOTES_TXT), NOTES_TXT.fileName, NOTES_TXT.id),
    ).rejects.toThrow('session expired');
    expect(mockUploadFile).toHaveBeenCalledTimes(1);
    expect(entry(NOTES_TXT.id)?.phase).toBe('failed');
  });

  it('offers Retry on a failed chip and not on one still uploading', () => {
    const store = useUploadLifecycleStore.getState();
    store.begin(NOTES_TXT.id);
    store.settle(NOTES_TXT.id, 'failed', 'Network request failed');
    store.begin(ROWS_CSV.id);

    const { getByTestId, queryByTestId } = render(
      <AttachmentPreview
        attachments={[NOTES_TXT, ROWS_CSV]}
        onRemove={jest.fn()}
        onRetryUpload={jest.fn()}
      />,
    );

    expect(getByTestId(`attachment-retry-${NOTES_TXT.id}`).props.accessibilityLabel).toBe(
      'Upload failed. Retry uploading notes.txt',
    );
    expect(queryByTestId(`attachment-retry-${ROWS_CSV.id}`)).toBeNull();
  });

  it('hides Retry when no resume handler is wired, rather than showing a dead control', () => {
    const store = useUploadLifecycleStore.getState();
    store.begin(NOTES_TXT.id);
    store.settle(NOTES_TXT.id, 'failed');

    const { queryByTestId } = render(
      <AttachmentPreview attachments={[NOTES_TXT]} onRemove={jest.fn()} />,
    );

    expect(queryByTestId(`attachment-retry-${NOTES_TXT.id}`)).toBeNull();
  });

  it('names every unsent file in the message the composer shows', () => {
    expect(unsentAttachmentMessage(['notes.txt'])).toContain('“notes.txt”');
    expect(unsentAttachmentMessage(['notes.txt'])).toContain('Tap Retry on the file');
    const both = unsentAttachmentMessage(['notes.txt', 'rows.csv']);
    expect(both).toContain('“notes.txt”, “rows.csv”');
    expect(both).toContain('Tap Retry on each file');
  });
});
