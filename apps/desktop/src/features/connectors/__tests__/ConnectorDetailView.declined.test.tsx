import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  storage: 'local-vault' as const,
  get: vi.fn(),
  set: vi.fn(),
  list: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('@agiworkforce/unified-chat', () => ({
  getConnectorPermissionStore: () => store,
}));

vi.mock('@/ui/Select', () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    disabled?: boolean;
    children: ReactNode;
  }) => (
    <select
      data-testid="permission-select"
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ value }: { value: string }) => <option value={value}>{value}</option>,
}));

import { ConnectorDetailView } from '../ConnectorDetailView';
import type { ConnectorDef } from '../connectorDefinitions';

const connector = { id: 'gmail', name: 'Gmail', description: 'Read and send mail' } as ConnectorDef;
const tools = [{ name: 'delete_mail', description: 'Delete a message', destructive: true }];

const DECLINED = 'The change was not confirmed, so the permission was not changed.';

describe('a connector permission change the system dialog did not confirm', () => {
  beforeEach(() => {
    store.set.mockReset();
    store.list.mockReset();
    store.list.mockResolvedValue({ store: { state: 'ok' }, permissions: [] });
  });

  afterEach(() => cleanup());

  it('puts the choice back and says the permission was not changed', async () => {
    store.set.mockRejectedValue(new Error(DECLINED));
    render(<ConnectorDetailView connector={connector} tools={tools} onBack={() => {}} />);
    const select = (await screen.findByTestId('permission-select')) as HTMLSelectElement;
    expect(select.value).toBe('blocked');

    fireEvent.change(select, { target: { value: 'needs-approval' } });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `Permission not saved, delete_mail: ${DECLINED}`,
    );
    await waitFor(() => expect(select.value).toBe('blocked'));
    expect(store.set).toHaveBeenCalledWith('gmail', 'delete_mail', 'needs-approval', true);
  });

  it('keeps the new choice and shows no error when the change is saved', async () => {
    store.set.mockResolvedValue(undefined);
    render(<ConnectorDetailView connector={connector} tools={tools} onBack={() => {}} />);
    const select = (await screen.findByTestId('permission-select')) as HTMLSelectElement;

    fireEvent.change(select, { target: { value: 'needs-approval' } });

    await waitFor(() => expect(store.set).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(select.value).toBe('needs-approval'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
