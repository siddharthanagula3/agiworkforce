/**
 * DesktopTasks.test.tsx — the desktop half of the Tasks transport.
 *
 * The shared list is covered in @agiworkforce/unified-chat. Desktop's own part
 * is the transport: that it uses the desktop run client (bearer token + guarded
 * egress) rather than web's Clerk/CSRF one, and that "open this conversation"
 * switches the shell instead of pushing a route it does not have.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(() => ({ marker: 'desktop-run-client' })),
  signedIn: true,
  toastError: vi.fn(),
}));

vi.mock('@/api/cloudApi', () => ({
  createDesktopCloudAgentRunClient: () => mocks.createClient(),
}));
vi.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => mocks.toastError(...a) } }));
vi.mock('@/stores/auth', () => ({
  selectHasCloudAccountSession: () => mocks.signedIn,
  useAuthStore: (selector: (s: unknown) => unknown) => selector({}),
}));

interface CapturedTasksTransport {
  client: { marker?: string };
  openConversation(conversationId: string): void;
  notifyError(message: string): void;
}

const captured: { transport?: CapturedTasksTransport } = {};
vi.mock('@agiworkforce/unified-chat', () => ({
  TasksPage: (props: { transport: CapturedTasksTransport }) => {
    captured.transport = props.transport;
    return <div data-testid="shared-tasks" />;
  },
}));

/** Fail loudly rather than optional-chaining past a transport that never arrived. */
function transport(): CapturedTasksTransport {
  if (!captured.transport) throw new Error('TasksPage was never rendered with a transport');
  return captured.transport;
}

const { DesktopTasks } = await import('../DesktopTasks');

describe('DesktopTasks transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signedIn = true;
    captured.transport = undefined;
  });

  it('asks for sign-in rather than implying you have no tasks', () => {
    mocks.signedIn = false;
    render(<DesktopTasks onOpenConversation={vi.fn()} />);

    expect(screen.getByText(/Sign in to see your tasks/i)).toBeTruthy();
    expect(screen.queryByTestId('shared-tasks')).toBeNull();
  });

  it('uses the desktop run client, not web auth', () => {
    render(<DesktopTasks onOpenConversation={vi.fn()} />);

    expect(mocks.createClient).toHaveBeenCalled();
    expect(transport().client).toMatchObject({ marker: 'desktop-run-client' });
  });

  it('opens a conversation through the shell rather than a route', () => {
    const onOpenConversation = vi.fn();
    render(<DesktopTasks onOpenConversation={onOpenConversation} />);

    transport().openConversation('conv-1');
    expect(onOpenConversation).toHaveBeenCalledWith('conv-1');
  });

  it('surfaces a failure to the user instead of swallowing it', () => {
    render(<DesktopTasks onOpenConversation={vi.fn()} />);

    transport().notifyError('Could not stop the task.');
    expect(mocks.toastError).toHaveBeenCalledWith('Could not stop the task.');
  });
});
