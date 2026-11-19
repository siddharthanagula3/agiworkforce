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

import { api, resetApiAccountState } from '../services/api';
import { ApiHttpError } from '../services/apiErrors';
import { DAILY_UPLOAD_LIMIT_CODE, dailyUploadLimitMessage } from '../services/failureCopy';

const ATTACHMENT = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'report.pdf',
  mimeType: 'application/pdf',
  byteCount: 2048,
  type: 'file' as const,
  url: '/api/files/00000000-0000-4000-8000-000000000002',
};

const DAILY_LIMIT_BODY = {
  error: {
    code: 'RATE_LIMIT_EXCEEDED',
    message:
      'This account can upload 5 files a day, and today’s are used. Upload more after midnight UTC, or upgrade for more.',
    details: { code: DAILY_UPLOAD_LIMIT_CODE },
  },
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

function plainReply(text: string, status: number): Response {
  return {
    ok: false,
    status,
    headers: { get: () => 'text/plain' },
    json: async () => {
      throw new SyntaxError('not json');
    },
    text: async () => text,
  } as unknown as Response;
}

const fetchMock = jest.fn();
const pdf = { name: 'report.pdf', type: 'application/pdf', uri: 'file:///report.pdf' };

function respondWith(step: 'presign' | 'complete', refusal: Response) {
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/api/uploads/presign')) {
      return step === 'presign'
        ? refusal
        : reply({
            storageKey: 'chat-attachments/user/report.pdf',
            uploadUrl: 'https://storage.example.test/upload',
            uploadMethod: 'PUT',
            uploadHeaders: { 'Content-Type': 'application/pdf' },
          });
    }
    if (url.endsWith('/api/uploads/chat-attachment/complete')) {
      return step === 'complete' ? refusal : reply({ attachment: ATTACHMENT });
    }
    return reply({ error: 'unexpected' }, 500);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetApiAccountState();
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  mockUploadAsync.mockResolvedValue({ status: 200, body: '', headers: {} });
  mockGetInfoAsync.mockResolvedValue({
    exists: true,
    isDirectory: false,
    size: ATTACHMENT.byteCount,
  });
});

describe.each(['presign', 'complete'] as const)('a refused upload at the %s step', (step) => {
  it('keeps the server body, so the daily upload limit is recognised', async () => {
    respondWith(step, reply(DAILY_LIMIT_BODY, 429));

    const refusal = await api.uploadFile(pdf).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ApiHttpError);
    expect(refusal).toMatchObject({ status: 429, body: DAILY_LIMIT_BODY });
    const message = dailyUploadLimitMessage(refusal as ApiHttpError);
    expect(message).toEqual(expect.any(String));
    expect(message).toContain('midnight UTC');
    expect(message).not.toMatch(/upgrade/i);
    expect(mockUploadInParts).not.toHaveBeenCalled();
  });

  it('reads the message and carries no body when the server sent no JSON', async () => {
    respondWith(step, plainReply('Bad gateway', 502));

    const refusal = await api.uploadFile(pdf).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ApiHttpError);
    expect(refusal).toMatchObject({ status: 502 });
    expect((refusal as ApiHttpError).body).toBeUndefined();
    expect((refusal as ApiHttpError).message).toBe(
      'Uploading "report.pdf" failed because the server hit a problem. Please try again.',
    );
  });
});
