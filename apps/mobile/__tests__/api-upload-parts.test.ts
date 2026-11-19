jest.mock('../services/authSession', () => ({
  getAuthToken: jest.fn(async () => 'test-token'),
  getAuthHeaders: jest.fn(async () => ({ Authorization: 'Bearer test-token' })),
  refreshAuthSession: jest.fn(async () => false),
  clearAuthSession: jest.fn(async () => undefined),
}));

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Platform: { OS: 'ios' },
  NativeModules: {},
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.0' } },
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('@/__mocks__/expo-router.mock').expoRouterMock(),
  router: { push: jest.fn() },
}));

jest.mock('../lib/constants', () => ({
  API_URL: 'https://api.test.local',
  TIMEOUTS: { DEFAULT: 10_000, UPLOAD: 30_000 },
}));

jest.mock('../src/platform/webContentPage', () => ({
  openWebContentPage: jest.fn(async () => true),
}));

jest.mock('../lib/abortSignal', () => ({
  combineAbortSignals: (signals: AbortSignal[]) => signals[0],
}));

jest.mock('../lib/egressGuard', () => ({
  guardedFetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
}));

jest.mock('../lib/mmkv', () => ({
  storage: { getString: () => undefined, set: jest.fn(), delete: jest.fn() },
}));

jest.mock('../src/features/auth/services/cloudAccountTeardown', () => ({
  clearLocalCloudAccountState: jest.fn(),
}));

jest.mock('../src/features/auth/services/rememberedAccount', () => ({
  forgetRememberedAccount: jest.fn(),
}));

jest.mock('../src/features/auth/services/accountSecurityEvents', () => ({
  announcePasskeyRequired: jest.fn(),
}));

const mockGetInfoAsync = jest.fn();
const mockUploadAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  FileSystemUploadType: { BINARY_CONTENT: 0 },
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  createUploadTask: jest.fn(() => ({
    uploadAsync: (...args: unknown[]) => mockUploadAsync(...args),
    cancelAsync: jest.fn(async () => undefined),
  })),
}));

const mockUploadInParts = jest.fn();
jest.mock('../src/features/chat/upload/partedChatUpload', () => ({
  uploadChatAttachmentInParts: (...args: unknown[]) => mockUploadInParts(...args),
}));

import {
  CHAT_IMAGE_ATTACHMENT_TOO_LARGE_MESSAGE,
  MAX_CHAT_ATTACHMENT_BYTES,
  CHAT_ATTACHMENT_LIMITS,
  CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE,
  MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
  ManagedCloudResumableUploadError,
  RESUMABLE_UPLOAD_PART_BYTES,
  RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES,
  chatAttachmentLimitsToWire,
  chatImageTooLargeMessage,
} from '@agiworkforce/cloud-contracts';
import { createUploadTask } from 'expo-file-system/legacy';
import { api, resetApiAccountState } from '../services/api';
import {
  applyServerAttachmentLimits,
  clearServerAttachmentLimits,
} from '../src/features/chat/upload/attachmentLimits';
import { ApiHttpError, CloudCredentialUnavailableError } from '../services/apiErrors';

const ATTACHMENT = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'report.pdf',
  mimeType: 'application/pdf',
  byteCount: RESUMABLE_UPLOAD_PART_BYTES + 1,
  type: 'file' as const,
  url: '/api/files/00000000-0000-4000-8000-000000000001',
};

function reply(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const fetchMock = jest.fn();

function sized(byteCount: number) {
  mockGetInfoAsync.mockResolvedValue({ exists: true, isDirectory: false, size: byteCount });
}

const pdf = { name: 'report.pdf', type: 'application/pdf', uri: 'file:///report.pdf' };

beforeEach(() => {
  jest.clearAllMocks();
  resetApiAccountState();
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  mockUploadAsync.mockResolvedValue({ status: 200, body: '', headers: {} });
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/uploads/presign')) {
      return reply({
        storageKey: 'chat-attachments/user/report.pdf',
        uploadUrl: 'https://storage.example.test/upload',
        uploadMethod: 'PUT',
        uploadHeaders: { 'Content-Type': 'application/pdf' },
      });
    }
    if (url.endsWith('/api/uploads/chat-attachment/complete')) {
      return reply({ attachment: ATTACHMENT });
    }
    return reply({ error: 'unexpected' }, 500);
  });
});

describe('api.uploadFile chooses the parted upload by size', () => {
  it('uploads a file larger than one part in parts, from the file on disk', async () => {
    sized(RESUMABLE_UPLOAD_PART_BYTES + 1);
    mockUploadInParts.mockResolvedValue(ATTACHMENT);
    const onProgress = jest.fn();

    const result = await api.uploadFile(pdf, { onProgress, conversationId: 'conversation-1' });

    expect(result.id).toBe(ATTACHMENT.id);
    expect(mockUploadInParts).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'file:///report.pdf',
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        byteCount: RESUMABLE_UPLOAD_PART_BYTES + 1,
        conversationId: 'conversation-1',
        onProgress,
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createUploadTask).not.toHaveBeenCalled();
  });

  it('uploads a file the web host could not carry in one request in parts', async () => {
    sized(RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES + 1);
    mockUploadInParts.mockResolvedValue(ATTACHMENT);

    await expect(api.uploadFile(pdf)).resolves.toMatchObject({ id: ATTACHMENT.id });

    expect(mockUploadInParts).toHaveBeenCalledTimes(1);
    expect(createUploadTask).not.toHaveBeenCalled();
  });

  it('sends a file the web host can carry in a single request', async () => {
    sized(RESUMABLE_UPLOAD_RELAY_SEGMENT_BYTES);

    await expect(api.uploadFile(pdf)).resolves.toMatchObject({ id: ATTACHMENT.id });

    expect(mockUploadInParts).not.toHaveBeenCalled();
    expect(createUploadTask).toHaveBeenCalledTimes(1);
  });

  it('falls back to a single request when the server cannot take parts', async () => {
    sized(RESUMABLE_UPLOAD_PART_BYTES + 1);
    mockUploadInParts.mockResolvedValue(null);

    await expect(api.uploadFile(pdf)).resolves.toMatchObject({ id: ATTACHMENT.id });

    expect(mockUploadInParts).toHaveBeenCalledTimes(1);
    expect(createUploadTask).toHaveBeenCalledTimes(1);
  });

  it('makes an interrupted parted upload a retryable failure and a refusal a final one', async () => {
    sized(RESUMABLE_UPLOAD_PART_BYTES + 1);
    mockUploadInParts.mockRejectedValueOnce(
      new ManagedCloudResumableUploadError('The upload was interrupted.', 0),
    );
    await expect(api.uploadFile(pdf)).rejects.toMatchObject({ name: 'ApiHttpError', status: 0 });

    mockUploadInParts.mockRejectedValueOnce(
      new ManagedCloudResumableUploadError('Too large.', 413),
    );
    await expect(api.uploadFile(pdf)).rejects.toMatchObject({ status: 413, message: 'Too large.' });

    mockUploadInParts.mockRejectedValueOnce(
      new ManagedCloudResumableUploadError('Signed out.', 401),
    );
    await expect(api.uploadFile(pdf)).rejects.toBeInstanceOf(CloudCredentialUnavailableError);
  });
});

describe('api.uploadFile refuses a file over its ceiling before any request', () => {
  beforeEach(() => {
    applyServerAttachmentLimits(chatAttachmentLimitsToWire(CHAT_ATTACHMENT_LIMITS));
  });

  afterEach(() => {
    clearServerAttachmentLimits();
  });

  it('admits a document at the chat limit and refuses one byte more', async () => {
    sized(MAX_CHAT_ATTACHMENT_BYTES);
    mockUploadInParts.mockResolvedValue(ATTACHMENT);
    await expect(api.uploadFile(pdf)).resolves.toMatchObject({ id: ATTACHMENT.id });

    jest.clearAllMocks();
    sized(MAX_CHAT_ATTACHMENT_BYTES + 1);
    const refusal = await api.uploadFile(pdf).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(ApiHttpError);
    expect(refusal).toMatchObject({ status: 413 });
    expect(mockUploadInParts).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('holds an image to the image ceiling', async () => {
    sized(MAX_CHAT_IMAGE_ATTACHMENT_BYTES + 1);
    const refusal = await api
      .uploadFile({ name: 'photo.jpg', type: 'image/jpeg', uri: 'file:///photo.jpg' })
      .catch((error: unknown) => error);

    expect(refusal).toMatchObject({ status: 413 });
    expect(String((refusal as Error).message)).toContain(CHAT_IMAGE_ATTACHMENT_TOO_LARGE_MESSAGE);
    expect(mockUploadInParts).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('api.uploadFile before the server has handed the account its limits', () => {
  it('refuses a document the build allows but an older server would refuse', async () => {
    sized(CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE.maxFileBytes + 1);

    const refusal = await api.uploadFile(pdf).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ApiHttpError);
    expect(refusal).toMatchObject({ status: 413 });
    expect(mockUploadInParts).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('admits a document at the conservative limit', async () => {
    sized(CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE.maxFileBytes);
    mockUploadInParts.mockResolvedValue(ATTACHMENT);

    await expect(api.uploadFile(pdf)).resolves.toMatchObject({ id: ATTACHMENT.id });
  });
});

describe('api.uploadFile works to the limits the server handed the account', () => {
  afterEach(() => {
    clearServerAttachmentLimits();
  });

  it('admits a document over the build limit when the server allows it', async () => {
    applyServerAttachmentLimits(
      chatAttachmentLimitsToWire({
        ...CHAT_ATTACHMENT_LIMITS,
        maxFileBytes: MAX_CHAT_ATTACHMENT_BYTES * 2,
      }),
    );
    sized(MAX_CHAT_ATTACHMENT_BYTES + 1);
    mockUploadInParts.mockResolvedValue(ATTACHMENT);

    await expect(api.uploadFile(pdf)).resolves.toMatchObject({ id: ATTACHMENT.id });
    expect(mockUploadInParts).toHaveBeenCalledTimes(1);
  });

  it('refuses an image over a lower server image ceiling with the server number', async () => {
    const limits = {
      ...CHAT_ATTACHMENT_LIMITS,
      maxImageBytes: MAX_CHAT_IMAGE_ATTACHMENT_BYTES / 2,
    };
    applyServerAttachmentLimits(chatAttachmentLimitsToWire(limits));
    sized(limits.maxImageBytes + 1);

    const refusal = await api
      .uploadFile({ name: 'photo.jpg', type: 'image/jpeg', uri: 'file:///photo.jpg' })
      .catch((error: unknown) => error);

    expect(refusal).toMatchObject({ status: 413 });
    expect(String((refusal as Error).message)).toContain(chatImageTooLargeMessage(limits));
    expect(mockUploadInParts).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
