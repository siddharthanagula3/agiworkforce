import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecoveryKeysSheet } from './RecoveryKeysSheet';

vi.mock('@agiworkforce/ui', () => ({
  Button: ({
    variant: _variant,
    size: _size,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) => (
    <button {...props} />
  ),
}));
vi.mock('lucide-react', () => ({
  Check: () => <span data-testid="copied" />,
  Copy: () => <span data-testid="not-copied" />,
  Download: () => <span />,
}));

const batchA = { recoveryBatchId: 'a'.repeat(43), recoveryKeys: ['AAAA-BBBB', 'CCCC-DDDD'] };
const batchB = { recoveryBatchId: 'b'.repeat(43), recoveryKeys: ['EEEE-FFFF', 'GGGG-HHHH'] };
const writeText = vi.fn<(value: string) => Promise<void>>();
const onSavedChange = vi.fn();
const current = { value: true };
const isCurrent = () => current.value;
const sheet = (receipt: typeof batchA, saved = false) => (
  <RecoveryKeysSheet
    key={receipt.recoveryBatchId}
    keys={receipt.recoveryKeys}
    saved={saved}
    onSavedChange={onSavedChange}
    isCurrent={isCurrent}
  />
);
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
beforeEach(() => {
  vi.clearAllMocks();
  current.value = true;
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

describe('recovery keys receipt-keyed sheet', () => {
  it('copies only the currently displayed keys and resets copied state on a new batch', async () => {
    const view = render(sheet(batchA));
    fireEvent.click(screen.getByRole('button', { name: 'Copy keys' }));
    await screen.findByTestId('copied');
    expect(writeText).toHaveBeenLastCalledWith('AAAA-BBBB\nCCCC-DDDD\n');
    view.rerender(sheet(batchB));
    expect(screen.queryByTestId('copied')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy keys' }));
    await screen.findByTestId('copied');
    expect(writeText).toHaveBeenLastCalledWith('EEEE-FFFF\nGGGG-HHHH\n');
  });

  it.each(['resolve', 'reject'] as const)(
    'does not publish a delayed old clipboard %s into a new receipt',
    async (settlement) => {
      const old = deferred();
      writeText.mockReturnValueOnce(old.promise);
      const view = render(sheet(batchA));
      fireEvent.click(screen.getByRole('button', { name: 'Copy keys' }));
      expect(writeText).toHaveBeenCalledWith('AAAA-BBBB\nCCCC-DDDD\n');
      view.rerender(sheet(batchB));
      await act(async () => {
        if (settlement === 'resolve') old.resolve();
        else old.reject(new Error('Old clipboard failed'));
        await old.promise.catch(() => undefined);
      });
      expect(screen.queryByTestId('copied')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText(batchB.recoveryKeys[0]!)).toBeInTheDocument();
      // A native write already started cannot be undone; only UI publication is fenced.
    },
  );

  it('clears an old copy error with the old receipt', async () => {
    writeText.mockRejectedValueOnce(new Error('Clipboard permission denied'));
    const view = render(sheet(batchA));
    fireEvent.click(screen.getByRole('button', { name: 'Copy keys' }));
    await screen.findByRole('alert');
    view.rerender(sheet(batchB));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByTestId('copied')).not.toBeInTheDocument();
  });

  it.each(['resolve', 'reject'] as const)(
    'suppresses clipboard %s after session ownership expires',
    async (settlement) => {
      const pending = deferred();
      writeText.mockReturnValueOnce(pending.promise);
      render(sheet(batchA));
      fireEvent.click(screen.getByRole('button', { name: 'Copy keys' }));
      current.value = false;
      await act(async () => {
        if (settlement === 'resolve') pending.resolve();
        else pending.reject(new Error('Expired owner clipboard failure'));
        await pending.promise.catch(() => undefined);
      });
      expect(screen.queryByTestId('copied')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Copy keys' }));
      fireEvent.click(screen.getByRole('checkbox'));
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(onSavedChange).not.toHaveBeenCalled();
    },
  );

  it('downloads the current receipt and revokes its object URL', () => {
    const blobs: BlobPart[][] = [];
    const BlobStub = vi.fn(function (parts: BlobPart[]) {
      blobs.push(parts);
    });
    vi.stubGlobal('Blob', BlobStub);
    const createObjectURL = vi.fn(() => 'blob:recovery-fixture');
    const revokeObjectURL = vi.fn();
    const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const clicked: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ href: this.href, download: this.download });
    });
    try {
      const view = render(sheet(batchA));
      view.rerender(sheet(batchB));
      fireEvent.click(screen.getByRole('button', { name: 'Download keys' }));
      expect(blobs).toEqual([['EEEE-FFFF\nGGGG-HHHH\n']]);
      expect(BlobStub).toHaveBeenCalledWith(['EEEE-FFFF\nGGGG-HHHH\n'], { type: 'text/plain' });
      expect(clicked).toEqual([
        { href: 'blob:recovery-fixture', download: 'agi-recovery-keys.txt' },
      ]);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:recovery-fixture');
      current.value = false;
      fireEvent.click(screen.getByRole('button', { name: 'Download keys' }));
      expect(createObjectURL).toHaveBeenCalledTimes(1);
    } finally {
      if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
      else Reflect.deleteProperty(URL, 'createObjectURL');
      if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
      else Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });
});
