import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MessageHistory } from '../Messaging/MessageHistory';
import { invoke } from '../../lib/tauri-mock';

// Mock Radix Select to render a simple native <select> that triggers onValueChange
vi.mock('@radix-ui/react-select', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  return {
    Root: ({
      children,
      value,
      onValueChange,
    }: {
      children: React.ReactNode;
      value: string;
      onValueChange: (val: string) => void;
    }) =>
      React.createElement(
        'select',
        {
          value,
          onChange: (e: React.ChangeEvent<HTMLSelectElement>) => onValueChange(e.target.value),
          'data-testid': 'radix-select',
        },
        children,
      ),
    Trigger: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Value: () => null,
    Icon: () => null,
    Portal: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Content: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Viewport: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Item: ({ children, value }: { children: React.ReactNode; value: string }) =>
      React.createElement('option', { value }, children),
    ItemText: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    ItemIndicator: () => null,
    Group: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Label: ({ children }: { children: React.ReactNode }) =>
      React.createElement('label', null, children),
    Separator: () => null,
    ScrollUpButton: () => null,
    ScrollDownButton: () => null,
  };
});

const mockConnections = [
  { id: 'conn-1', platform: 'Slack', workspace_name: 'My Workspace' },
  { id: 'conn-2', platform: 'Discord' },
];

const mockMessages = [
  {
    id: 'msg-1',
    platform: 'Slack',
    channel_id: 'general',
    sender_id: 'user-1',
    sender_name: 'Alice',
    text: 'Hello everyone!',
    timestamp: Math.floor(Date.now() / 1000) - 3600,
  },
  {
    id: 'msg-2',
    platform: 'Slack',
    channel_id: 'general',
    sender_id: 'user-2',
    sender_name: 'Bob',
    text: 'Hi Alice, how are you?',
    timestamp: Math.floor(Date.now() / 1000) - 1800,
  },
  {
    id: 'msg-3',
    platform: 'Slack',
    channel_id: 'general',
    sender_id: 'user-3',
    text: 'Good morning!',
    timestamp: Math.floor(Date.now() / 1000) - 600,
  },
];

describe('MessageHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show a warning when no connections are provided', () => {
    render(<MessageHistory connections={[]} />);

    expect(screen.getByText('Please connect to a messaging platform first')).toBeInTheDocument();
  });

  it('should render the heading and controls when connections exist', () => {
    render(<MessageHistory connections={mockConnections} />);

    expect(screen.getByText('Message History')).toBeInTheDocument();
    expect(screen.getByText('Load History')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Channel / Recipient ID')).toBeInTheDocument();
  });

  it('should display empty state before loading messages', () => {
    render(<MessageHistory connections={mockConnections} />);

    expect(
      screen.getByText('No messages to display. Load history to see messages.'),
    ).toBeInTheDocument();
  });

  it('should show a validation error when loading without selecting connection and channel', async () => {
    render(<MessageHistory connections={mockConnections} />);

    fireEvent.click(screen.getByText('Load History'));

    await waitFor(() => {
      expect(
        screen.getByText('Please select a platform and enter a channel ID'),
      ).toBeInTheDocument();
    });
  });

  it('should render fetched messages after loading history', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockMessages);

    render(<MessageHistory connections={mockConnections} />);

    // Select a connection via the mocked native select
    const selectEl = screen.getByTestId('radix-select');
    fireEvent.change(selectEl, { target: { value: 'conn-1' } });

    // Fill in a channel ID
    const channelInput = screen.getByPlaceholderText('Channel / Recipient ID');
    fireEvent.change(channelInput, { target: { value: 'general' } });

    // Click Load History
    fireEvent.click(screen.getByText('Load History'));

    // Wait for messages to appear
    await waitFor(() => {
      expect(screen.getByText('Hello everyone!')).toBeInTheDocument();
    });

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Hi Alice, how are you?')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Good morning!')).toBeInTheDocument();
  });

  it('should display sender_id as fallback when sender_name is missing', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(mockMessages);

    render(<MessageHistory connections={mockConnections} />);

    const selectEl = screen.getByTestId('radix-select');
    fireEvent.change(selectEl, { target: { value: 'conn-1' } });

    const channelInput = screen.getByPlaceholderText('Channel / Recipient ID');
    fireEvent.change(channelInput, { target: { value: 'general' } });

    fireEvent.click(screen.getByText('Load History'));

    await waitFor(() => {
      // msg-3 has no sender_name, so sender_id should be displayed
      expect(screen.getByText('user-3')).toBeInTheDocument();
    });
  });

  it('should display an error when invoke fails', async () => {
    vi.mocked(invoke).mockRejectedValueOnce('Connection timeout');

    render(<MessageHistory connections={mockConnections} />);

    const selectEl = screen.getByTestId('radix-select');
    fireEvent.change(selectEl, { target: { value: 'conn-1' } });

    const channelInput = screen.getByPlaceholderText('Channel / Recipient ID');
    fireEvent.change(channelInput, { target: { value: 'general' } });

    fireEvent.click(screen.getByText('Load History'));

    await waitFor(() => {
      expect(screen.getByText('Connection timeout')).toBeInTheDocument();
    });
  });
});
