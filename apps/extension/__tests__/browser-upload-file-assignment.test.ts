import { File as NodeFile } from 'node:buffer';
import { createHash, webcrypto } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildUserFileUploadPreparationExpression,
  commitPreparedUserFileUpload,
  verifyCommittedUserFileUpload,
} from '../src/features/computer-use/cdpDriver';

const bytes = Buffer.from('synthetic browser upload');
const file = {
  name: 'fixture.txt',
  mediaType: 'text/plain',
  byteCount: bytes.length,
  checksumSha256: createHash('sha256').update(bytes).digest('hex'),
  base64: bytes.toString('base64'),
};
const signature = 'input||file||';
let dom: JSDOM;
let input: HTMLInputElement;
const nativeFiles = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
const assignedFiles = new WeakMap<object, unknown[]>();

beforeEach(() => {
  dom = new JSDOM('<input id="upload" type="file" accept=".txt">', {
    url: location.href,
    runScripts: 'outside-only',
  });
  input = dom.window.document.getElementById('upload') as HTMLInputElement;
  Object.defineProperty(HTMLInputElement.prototype, 'files', {
    configurable: true,
    get(this: object) {
      return assignedFiles.get(this) ?? [];
    },
    set(this: object, value: unknown[]) {
      assignedFiles.set(this, value);
    },
  });
  const transfer = class {
    files: NodeFile[] = [];
    items = { add: (file: NodeFile) => this.files.push(file) };
  };
  for (const [name, value] of Object.entries({
    File: NodeFile,
    crypto: webcrypto,
    DataTransfer: transfer,
  })) {
    vi.stubGlobal(name, value);
    Object.defineProperty(dom.window, name, { value, configurable: true });
  }
});
afterEach(() => {
  if (nativeFiles) Object.defineProperty(HTMLInputElement.prototype, 'files', nativeFiles);
  dom.window.close();
  vi.unstubAllGlobals();
});

function filesOf(target: Element): unknown[] {
  return assignedFiles.get(target) ?? [];
}

async function execute(files = [file], expectedSignature = signature) {
  const expression = buildUserFileUploadPreparationExpression(
    '#upload',
    expectedSignature,
    location.href,
    files,
  );
  // llm-guardrail-allow: executes the repository-owned upload expression inside this isolated test fixture.
  const prepared = await dom.window.eval(expression);
  commitPreparedUserFileUpload(prepared);
  return verifyCommittedUserFileUpload(prepared);
}

describe('production fixed file assignment function', () => {
  it('assigns verified bytes and normal DOM events without claiming trusted native input', async () => {
    const events: Array<{ type: string; trusted: boolean }> = [];
    for (const type of ['input', 'change'])
      input.addEventListener(type, (event) => events.push({ type, trusted: event.isTrusted }));
    await expect(execute()).resolves.toEqual({
      fileCount: 1,
      bytesVerified: true,
      eventTrusted: false,
    });
    expect((filesOf(input)[0] as NodeFile).name).toBe(file.name);
    expect(events).toEqual([
      { type: 'input', trusted: false },
      { type: 'change', trusted: false },
    ]);
  });

  it('rejects changed targets, incorrect hashes and incompatible multiple files before mutation', async () => {
    await expect(execute([file], 'input|other|file||')).rejects.toThrow('changed since read_dom');
    await expect(execute([{ ...file, checksumSha256: '0'.repeat(64) }])).rejects.toThrow(
      'checksum mismatch',
    );
    await expect(execute([file, file])).rejects.toThrow('only one file');
    expect(filesOf(input)).toHaveLength(0);
  });

  it('accepts an actual file-input brand from an adopted DOM realm', async () => {
    const frame = dom.window.document.createElement('iframe');
    dom.window.document.body.append(frame);
    const adopted = frame.contentDocument!.createElement('input');
    adopted.id = 'upload';
    adopted.type = 'file';
    input.replaceWith(adopted);
    input = adopted;
    expect(input instanceof dom.window.HTMLInputElement).toBe(false);
    await expect(execute()).resolves.toMatchObject({
      fileCount: 1,
      bytesVerified: true,
      eventTrusted: false,
    });
  });

  it('performs no input mutation or change event during asynchronous preparation', async () => {
    const events = vi.fn();
    input.addEventListener('change', events);
    // llm-guardrail-allow: executes the repository-owned upload expression inside this isolated test fixture.
    const prepared = await dom.window.eval(
      buildUserFileUploadPreparationExpression('#upload', signature, location.href, [file]),
    );
    expect(filesOf(input)).toHaveLength(0);
    expect(events).not.toHaveBeenCalled();
    commitPreparedUserFileUpload(prepared);
    expect(events).toHaveBeenCalledTimes(1);
    await expect(verifyCommittedUserFileUpload(prepared)).resolves.toMatchObject({
      bytesVerified: true,
      eventTrusted: false,
    });
  });

  it('rejects a file input disabled through its parent fieldset', async () => {
    const fieldset = dom.window.document.createElement('fieldset');
    fieldset.disabled = true;
    dom.window.document.body.append(fieldset);
    fieldset.append(input);
    expect(input.disabled).toBe(false);
    await expect(execute()).rejects.toThrow('enabled file input');
    expect(filesOf(input)).toHaveLength(0);
  });
});
