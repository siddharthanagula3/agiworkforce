import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildComputerUsePanel,
  type ComputerUsePanelAPI,
} from '../src/features/side-panel/computerUsePanel';
import type {
  BrowserUploadBinding,
  BrowserUploadedFileMetadata,
} from '../src/features/computer-use/userFileUpload';

type UserFileUploadModule = typeof import('../src/features/computer-use/userFileUpload');

const inspection = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock('../src/features/computer-use/userFileUpload', async (importOriginal) => ({
  ...(await importOriginal<UserFileUploadModule>()),
  uploadSelectedUserFiles: inspection.upload,
}));

const binding: BrowserUploadBinding = {
  requestId: 'approval-upload',
  runId: 'cu_run_upload',
  runGeneration: 3,
  tabId: 7,
  tabUrl: 'https://example.com/application',
  targetSignature: 'input||file|resume|Upload resume',
  owner: { accountId: 'account-a', authIncarnation: 'session-a' },
};
const metadata: BrowserUploadedFileMetadata[] = [
  {
    attachment: {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'resume.txt',
      mimeType: 'text/plain',
      byteCount: 5,
      type: 'file',
      url: '/api/files/11111111-1111-4111-8111-111111111111',
    },
    checksumSha256: 'a'.repeat(64),
  },
];

let panel: ComputerUsePanelAPI;
let decision: ReturnType<typeof vi.fn>;
let assertCurrent: ReturnType<typeof vi.fn>;

function filePicker(): HTMLInputElement {
  return panel.panelEl.querySelector<HTMLInputElement>('.sp-cu-upload-picker')!;
}
function chooseFile(): void {
  Object.defineProperty(filePicker(), 'files', {
    configurable: true,
    value: [new File(['hello'], 'resume.txt', { type: 'text/plain' })],
  });
  filePicker().dispatchEvent(new Event('change'));
}
function allow(): void {
  panel.panelEl.querySelector<HTMLButtonElement>('.sp-cu-approval-allow')!.click();
}
function skip(): void {
  panel.panelEl.querySelector<HTMLButtonElement>('.sp-cu-approval-deny')!.click();
}

beforeEach(() => {
  document.body.innerHTML = '';
  inspection.upload.mockReset();
  inspection.upload.mockResolvedValue(metadata);
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        lastError: undefined,
        sendMessage: vi.fn(async () => ({ success: true, running: false })),
      },
      storage: {
        local: {
          get: vi.fn((_key, callback?: (items: Record<string, unknown>) => void) => {
            callback?.({});
            return Promise.resolve({});
          }),
          set: vi.fn(async () => {}),
        },
      },
    },
  });
  panel = buildComputerUsePanel();
  document.body.appendChild(panel.panelEl);
  panel.setRunState(true, binding.runId, binding.runGeneration);
  decision = vi.fn();
  assertCurrent = vi.fn(async () => {});
  panel.showApprovalCard('upload_file', 'Upload to the resume input.', false, decision, {
    binding,
    assertCurrent,
  });
});

describe('user-selected browser upload approval', () => {
  it('keeps selection local and previews exact names, sizes, site and the cloud inspection disclosure', async () => {
    expect(panel.panelEl.querySelector<HTMLButtonElement>('.sp-cu-approval-allow')?.disabled).toBe(
      true,
    );
    chooseFile();
    expect(panel.panelEl.textContent).toContain('resume.txt · 5 bytes');
    expect(panel.panelEl.textContent).toContain('AGI Cloud for inspection');
    expect(panel.panelEl.textContent).toContain('https://example.com');
    expect(panel.panelEl.textContent).toContain('Choosing files sends nothing');
    expect(inspection.upload).not.toHaveBeenCalled();
    expect(decision).not.toHaveBeenCalled();

    allow();
    await vi.waitFor(() => expect(decision).toHaveBeenCalledWith('allow', metadata));
    expect(inspection.upload).toHaveBeenCalledOnce();
    expect(inspection.upload.mock.calls[0]?.[0][0].name).toBe('resume.txt');
    expect(inspection.upload.mock.calls[0]?.[1]).toEqual(binding);
  });

  it('skips a locally selected file without beginning inspection', () => {
    chooseFile();
    skip();
    expect(inspection.upload).not.toHaveBeenCalled();
    expect(decision).toHaveBeenCalledWith('skip', undefined);
  });

  it('aborts inspection on Skip and ignores a late inspected completion', async () => {
    let complete!: (files: BrowserUploadedFileMetadata[]) => void;
    inspection.upload.mockReturnValue(
      new Promise<BrowserUploadedFileMetadata[]>((resolve) => {
        complete = resolve;
      }),
    );
    chooseFile();
    allow();
    await vi.waitFor(() => expect(inspection.upload).toHaveBeenCalledOnce());
    const signal = inspection.upload.mock.calls[0]?.[2].signal as AbortSignal;
    skip();
    expect(signal.aborted).toBe(true);
    expect(panel.panelEl.textContent).toContain('No file was sent to the website');
    complete(metadata);
    await Promise.resolve();
    await Promise.resolve();
    expect(decision).toHaveBeenCalledOnce();
    expect(decision).toHaveBeenCalledWith('skip', undefined);
  });

  it('cancels the approval and inspector when the active run stops', async () => {
    inspection.upload.mockReturnValue(new Promise(() => {}));
    chooseFile();
    allow();
    await vi.waitFor(() => expect(inspection.upload).toHaveBeenCalledOnce());
    const signal = inspection.upload.mock.calls[0]?.[2].signal as AbortSignal;
    panel.setRunState(false, binding.runId);
    expect(signal.aborted).toBe(true);
    expect(decision).toHaveBeenCalledWith('skip', undefined);
    expect(filePicker().disabled).toBe(true);
    expect(filePicker().value).toBe('');
  });

  it('refuses an account change before any inspection transfer', async () => {
    assertCurrent.mockRejectedValue(new Error('The account changed.'));
    chooseFile();
    allow();
    await vi.waitFor(() => expect(decision).toHaveBeenCalledWith('skip'));
    expect(inspection.upload).not.toHaveBeenCalled();
    expect(panel.panelEl.textContent).toContain('The account changed.');
    expect(panel.panelEl.textContent).toContain('No file was sent to the website');
  });

  it('reports an inspection failure and sends no website approval metadata', async () => {
    inspection.upload.mockRejectedValue(new Error('File inspection rejected this file.'));
    chooseFile();
    allow();
    await vi.waitFor(() => expect(decision).toHaveBeenCalledWith('skip'));
    expect(panel.panelEl.textContent).toContain('File inspection rejected this file.');
    expect(panel.panelEl.textContent).toContain('No file was sent to the website');
    expect(decision).not.toHaveBeenCalledWith('allow', expect.anything());
  });
});
