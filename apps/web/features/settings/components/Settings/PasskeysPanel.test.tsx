import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred, passkeyFixture } from '@/lib/identity/__tests__/passkey-fixture';
const mocks = vi.hoisted(() => ({
  fixture: null as unknown,
  confirmCallbacks: [] as Array<() => unknown>,
}));
vi.mock('@clerk/nextjs', async () => ({
  ...(await vi.importActual('@clerk/nextjs')),
  useAuth: () => {
    const { clerk } = mocks.fixture as ReturnType<typeof passkeyFixture>;
    return { isLoaded: true, isSignedIn: true, userId: clerk.user.id, sessionId: clerk.session.id };
  },
  useClerk: () => (mocks.fixture as ReturnType<typeof passkeyFixture>).clerk,
  useUser: () => ({
    isLoaded: true,
    user: (mocks.fixture as ReturnType<typeof passkeyFixture>).clerk.user,
  }),
}));
vi.mock('@agiworkforce/ui', async () => {
  const actual = await vi.importActual<ImportedModule0>('@agiworkforce/ui');
  return {
    ...actual,
    useConfirmAction: () => {
      const native = actual.useConfirmAction();
      return {
        ...native,
        confirm: (request: Parameters<typeof native.confirm>[0]) => {
          mocks.confirmCallbacks.push(request.onConfirm);
          native.confirm(request);
        },
      };
    },
  };
});
import { PasskeysPanel } from './PasskeysPanel';
let fixture: ReturnType<typeof passkeyFixture>;
beforeEach(() => {
  fixture = passkeyFixture();
  mocks.fixture = fixture;
  mocks.confirmCallbacks = [];
  vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
});
afterEach(() => vi.unstubAllGlobals());
const add = () => screen.getByRole('button', { name: 'Add a passkey' });
const remove = () => screen.getByRole('button', { name: 'Remove MacBook' });
const rename = () => screen.getByRole('button', { name: 'Rename MacBook' });
describe('PasskeysPanel owned intent lifetime', () => {
  it('adds through the native resource and refreshes', async () => {
    render(<PasskeysPanel />);
    await userEvent.click(add());
    expect(fixture.user.createPasskey).toHaveBeenCalledTimes(1);
    expect(fixture.user.reload).toHaveBeenCalledTimes(1);
  });
  it('reserves removal before confirmation and releases on cancel', async () => {
    render(<PasskeysPanel />);
    const addButton = add();
    const renameButton = rename();
    await userEvent.click(remove());
    expect(fixture.key.delete).not.toHaveBeenCalled();
    expect(addButton).toBeDisabled();
    expect(renameButton).toBeDisabled();
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }),
    );
    expect(add()).toBeEnabled();
    await userEvent.click(remove());
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove passkey' }),
    );
    expect(fixture.key.delete).toHaveBeenCalledTimes(1);
  });
  it('rejects duplicate add events and overlapping mutation controls', async () => {
    const pending = deferred();
    fixture.user.createPasskey.mockImplementation(() => pending.promise);
    render(<PasskeysPanel />);
    act(() => {
      fireEvent.click(add());
      fireEvent.click(add());
      fireEvent.click(remove());
    });
    expect(fixture.user.createPasskey).toHaveBeenCalledTimes(1);
    expect(fixture.key.delete).not.toHaveBeenCalled();
    await act(async () => pending.resolve());
  });
  it('captures name once and does not abandon a pending rename on Escape', async () => {
    const pending = deferred();
    fixture.key.update.mockImplementation(() => pending.promise);
    render(<PasskeysPanel />);
    await userEvent.click(rename());
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: ' Laptop ' } });
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.keyDown(input, { key: 'Escape' });
    });
    expect(fixture.key.update).toHaveBeenCalledTimes(1);
    expect(fixture.key.update).toHaveBeenCalledWith({ name: 'Laptop' });
    expect(input).toBeInTheDocument();
    expect(add()).toBeDisabled();
    await act(async () => pending.resolve());
    expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('retires abandoned rename drafts and permits a new editor', async () => {
    render(<PasskeysPanel />);
    await userEvent.click(rename());
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    await userEvent.click(rename());
    expect(screen.getByRole('textbox')).toHaveValue('MacBook');
    expect(fixture.key.update).not.toHaveBeenCalled();
  });
  it('invalidates a pending confirmation on observed A to B to A', async () => {
    render(<PasskeysPanel />);
    await userEvent.click(remove());
    const confirm = within(screen.getByRole('alertdialog')).getByRole('button', {
      name: 'Remove passkey',
    });
    const original = fixture.clerk.session;
    act(() => {
      fixture.clerk.session = { ...original, id: 'session-2' };
      fixture.emit();
      fixture.clerk.session = original;
      fixture.emit();
    });
    fireEvent.click(confirm);
    expect(fixture.key.delete).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
  it('does not reload after an unmounted mutation completes', async () => {
    const pending = deferred();
    fixture.user.createPasskey.mockImplementation(() => pending.promise);
    const view = render(<PasskeysPanel />);
    await userEvent.click(add());
    view.unmount();
    await act(async () => pending.resolve());
    expect(fixture.user.reload).not.toHaveBeenCalled();
    expect(fixture.listeners.size).toBe(0);
  });
  it('ignores a reload failure after unmount', async () => {
    const pending = deferred<{ id: string }>();
    fixture.user.reload.mockImplementation(() => pending.promise);
    const view = render(<PasskeysPanel />);
    await userEvent.click(add());
    expect(fixture.user.reload).toHaveBeenCalledTimes(1);
    view.unmount();
    await act(async () => pending.reject(new Error('refresh failed')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fixture.listeners.size).toBe(0);
  });
  it.each(['mutation', 'reload', 'cancel'] as const)(
    'requires review after opaque %s failure',
    async (phase) => {
      if (phase === 'reload')
        fixture.user.reload.mockRejectedValueOnce(new Error('refresh failed'));
      else
        fixture.user.createPasskey.mockRejectedValueOnce(
          phase === 'cancel'
            ? new DOMException('The operation was cancelled', 'NotAllowedError')
            : new Error('network'),
        );
      render(<PasskeysPanel />);
      await userEvent.click(add());
      expect(screen.getByRole('alert')).toHaveTextContent(/may already have completed/);
      expect(add()).toBeDisabled();
      await userEvent.click(screen.getByRole('button', { name: 'I have reviewed my passkeys' }));
      expect(add()).toBeEnabled();
    },
  );
  it('does not dispatch after native target replacement while confirming', async () => {
    render(<PasskeysPanel />);
    await userEvent.click(remove());
    fixture.user.passkeys = [{ ...fixture.key }];
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove passkey' }),
    );
    expect(fixture.key.delete).not.toHaveBeenCalled();
  });
  it('abandons an editor whose target disappears and releases its lane', async () => {
    render(<PasskeysPanel />);
    await userEvent.click(rename());
    act(() => {
      fixture.user.passkeys = [];
      fixture.emit();
    });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(add()).toBeEnabled();
    expect(fixture.key.update).not.toHaveBeenCalled();
  });
  it('retains uncertainty through same-session user replacement until acknowledgment', async () => {
    fixture.user.createPasskey.mockRejectedValueOnce(new Error('network'));
    render(<PasskeysPanel />);
    await userEvent.click(add());
    act(() => {
      const replacement = { ...fixture.user };
      fixture.clerk.user = replacement;
      fixture.session.user = replacement;
      fixture.emit();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/may already have completed/);
    expect(add()).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'I have reviewed my passkeys' }));
    act(() => {
      const replacement = { ...fixture.user };
      fixture.clerk.user = replacement;
      fixture.session.user = replacement;
      fixture.emit();
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(add()).toBeEnabled();
  });
  it('fails closed if reload replaces the native resource and keeps an uncertainty notice', async () => {
    fixture.user.reload.mockImplementation(async () => {
      const replacement = { ...fixture.user };
      fixture.clerk.user = replacement;
      fixture.session.user = replacement;
      fixture.emit();
      return replacement;
    });
    render(<PasskeysPanel />);
    await userEvent.click(add());
    expect(screen.getByRole('alert')).toHaveTextContent(/may already have completed/);
    expect(add()).toBeDisabled();
  });
  it('abandons a vanished target on rerender even without an SDK notification', async () => {
    const view = render(<PasskeysPanel />);
    await userEvent.click(rename());
    fixture.user.passkeys = [];
    view.rerender(<PasskeysPanel />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(add()).toBeEnabled();
    expect(fixture.key.update).not.toHaveBeenCalled();
  });
  it('retires a replaced reload owner without relying on SDK notification', async () => {
    fixture.user.reload.mockImplementation(async () => {
      const replacement = { ...fixture.user };
      fixture.clerk.user = replacement;
      fixture.session.user = replacement;
      return replacement;
    });
    render(<PasskeysPanel />);
    await userEvent.click(add());
    expect(screen.getByRole('alert')).toHaveTextContent(/may already have completed/);
    expect(add()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'I have reviewed my passkeys' })).toBeEnabled();
  });
  it.each(['mutation', 'reload'] as const)(
    'retires stale no-event %s rejection without stranding busy controls',
    async (phase) => {
      const fail = async () => {
        const replacement = { ...fixture.user };
        fixture.clerk.user = replacement;
        fixture.session.user = replacement;
        throw new Error('unconfirmed');
      };
      if (phase === 'mutation') fixture.user.createPasskey.mockImplementation(fail);
      else fixture.user.reload.mockImplementation(fail);
      render(<PasskeysPanel />);
      await userEvent.click(add());
      expect(screen.getByRole('alert')).toHaveTextContent(/may already have completed/);
      expect(screen.getByRole('button', { name: 'I have reviewed my passkeys' })).toBeEnabled();
      if (phase === 'mutation') expect(fixture.user.reload).not.toHaveBeenCalled();
    },
  );
  it.each(['add', 'rename', 'remove'] as const)(
    'reconciles a silent owner replacement on stale %s click without dispatch',
    async (action) => {
      render(<PasskeysPanel />);
      const staleButton = action === 'add' ? add() : action === 'rename' ? rename() : remove();
      const replacement = {
        ...fixture.user,
        passkeys: [{ ...fixture.key, name: 'Replacement key' }],
      };
      fixture.clerk.user = replacement;
      fixture.session.user = replacement;
      await userEvent.click(staleButton);
      expect(screen.getByText('Replacement key')).toBeInTheDocument();
      expect(fixture.user.createPasskey).not.toHaveBeenCalled();
      expect(fixture.key.update).not.toHaveBeenCalled();
      expect(fixture.key.delete).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    },
  );
  it('reconciles a silent owner replacement on acknowledgment without clearing retained uncertainty', async () => {
    fixture.user.createPasskey.mockRejectedValueOnce(new Error('network'));
    render(<PasskeysPanel />);
    await userEvent.click(add());
    const staleAck = screen.getByRole('button', { name: 'I have reviewed my passkeys' });
    const replacement = {
      ...fixture.user,
      passkeys: [{ ...fixture.key, name: 'Replacement key' }],
    };
    fixture.clerk.user = replacement;
    fixture.session.user = replacement;
    await userEvent.click(staleAck);
    expect(screen.getByText('Replacement key')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/may already have completed/);
    expect(add()).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'I have reviewed my passkeys' }));
    expect(add()).toBeEnabled();
  });
  it.each(['Remove passkey', 'Cancel'])(
    'reconciles silent owner replacement on retained confirmation %s',
    async (action) => {
      render(<PasskeysPanel />);
      await userEvent.click(remove());
      const staleButton = within(screen.getByRole('alertdialog')).getByRole('button', {
        name: action,
      });
      const replacement = {
        ...fixture.user,
        passkeys: [{ ...fixture.key, name: 'Replacement key' }],
      };
      fixture.clerk.user = replacement;
      fixture.session.user = replacement;
      await userEvent.click(staleButton);
      expect(fixture.key.delete).not.toHaveBeenCalled();
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.getByText('Replacement key')).toBeInTheDocument();
      expect(add()).toBeEnabled();
    },
  );
  it('rejects the actual retained confirmation callback after owner replacement without closing a newer dialog', async () => {
    render(<PasskeysPanel />);
    await userEvent.click(remove());
    const retained = mocks.confirmCallbacks[0]!;
    const original = fixture.clerk.session;
    act(() => {
      fixture.clerk.session = { ...original, id: 'session-2' };
      fixture.emit();
      fixture.clerk.session = original;
      fixture.emit();
    });
    await act(async () => {
      await retained();
    });
    expect(fixture.key.delete).not.toHaveBeenCalled();
    await userEvent.click(remove());
    const currentDialog = screen.getByRole('alertdialog');
    await act(async () => {
      await retained();
    });
    expect(fixture.key.delete).not.toHaveBeenCalled();
    expect(currentDialog).toBeInTheDocument();
    await userEvent.click(within(currentDialog).getByRole('button', { name: 'Remove passkey' }));
    expect(fixture.key.delete).toHaveBeenCalledTimes(1);
  });
  it('survives StrictMode replay and releases every listener', async () => {
    const view = render(
      <StrictMode>
        <PasskeysPanel />
      </StrictMode>,
    );
    await userEvent.click(add());
    expect(fixture.user.createPasskey).toHaveBeenCalledTimes(1);
    expect(fixture.listeners.size).toBe(1);
    view.unmount();
    expect(fixture.listeners.size).toBe(0);
  });
  it('hides unsupported creation rather than dispatching it', () => {
    vi.stubGlobal('PublicKeyCredential', undefined);
    render(<PasskeysPanel />);
    expect(screen.queryByRole('button', { name: 'Add a passkey' })).toBeNull();
  });
});

type ImportedModule0 = typeof import('@agiworkforce/ui');
