import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';

interface MessageComposerProps {
  connections: Array<{
    id: string;
    platform: string;
    workspace_name?: string;
  }>;
  onMessageSent?: () => void;
}

interface SendMessageResponse {
  message_id: string;
  timestamp: number;
  platform: string;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  connections,
  onMessageSent,
}) => {
  const [selectedConnection, setSelectedConnection] = useState('');
  const [channelId, setChannelId] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSendMessage = async () => {
    if (!selectedConnection || !channelId || !message.trim()) {
      setError('Please fill in all fields');
      return;
    }

    try {
      setSending(true);
      setError(null);
      setSuccess(null);

      const response = await invoke<SendMessageResponse>('send_message', {
        connectionId: selectedConnection,
        channelId,
        text: message,
      });

      setSuccess(`Message sent successfully (ID: ${response.message_id})`);
      setMessage('');

      if (onMessageSent) {
        onMessageSent();
      }
    } catch (err) {
      setError(err as string);
    } finally {
      setSending(false);
    }
  };

  const getChannelPlaceholder = () => {
    const connection = connections.find((c) => c.id === selectedConnection);
    if (!connection) return 'Enter channel/recipient ID';

    switch (connection.platform) {
      case 'Slack':
        return 'e.g., C1234567890 or #general';
      case 'WhatsApp':
        return 'e.g., +1234567890';
      case 'Teams':
        return 'e.g., team_id/channel_id';
      default:
        return 'Enter channel/recipient ID';
    }
  };

  if (connections.length === 0) {
    return (
      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-700">
        Please connect to a messaging platform first
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Send Message</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
          {success}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Platform</label>
          <Select
            value={selectedConnection}
            onValueChange={setSelectedConnection}
          >
            <option value="">Select a platform</option>
            {connections.map((conn) => (
              <option key={conn.id} value={conn.id}>
                {conn.platform}
                {conn.workspace_name ? ` - ${conn.workspace_name}` : ''}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Channel / Recipient</label>
          <input
            type="text"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder={getChannelPlaceholder()}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Enter the channel ID, phone number, or recipient identifier
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message here..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <p className="text-xs text-gray-500 mt-1">
            {message.length} characters
          </p>
        </div>

        <div className="flex gap-2 justify-end">
          <Button
            variant="secondary"
            onClick={() => {
              setSelectedConnection('');
              setChannelId('');
              setMessage('');
              setError(null);
              setSuccess(null);
            }}
          >
            Clear
          </Button>
          <Button onClick={handleSendMessage} disabled={sending}>
            {sending ? 'Sending...' : 'Send Message'}
          </Button>
        </div>
      </div>
    </div>
  );
};
