import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../Common/Button';
import { Select } from '../Common/Select';
import { Card } from '../Common/Card';

interface UnifiedMessage {
  id: string;
  platform: string;
  channel_id: string;
  sender_id: string;
  sender_name?: string;
  text: string;
  timestamp: number;
}

interface MessageHistoryProps {
  connections: Array<{
    id: string;
    platform: string;
    workspace_name?: string;
  }>;
}

export const MessageHistory: React.FC<MessageHistoryProps> = ({ connections }) => {
  const [selectedConnection, setSelectedConnection] = useState('');
  const [channelId, setChannelId] = useState('');
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoadHistory = async () => {
    if (!selectedConnection || !channelId) {
      setError('Please select a platform and enter a channel ID');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const history = await invoke<UnifiedMessage[]>('get_messaging_history', {
        connectionId: selectedConnection,
        channelId,
        limit: 50,
      });

      setMessages(history);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const diffHours = diff / (1000 * 60 * 60);

    if (diffHours < 24) {
      return date.toLocaleTimeString();
    } else {
      return date.toLocaleString();
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
      <h2 className="text-xl font-semibold mb-4">Message History</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <div className="flex-1">
          <Select
            value={selectedConnection}
            onChange={(e) => setSelectedConnection(e.target.value)}
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
        <div className="flex-1">
          <input
            type="text"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            placeholder="Channel / Recipient ID"
            className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Button onClick={handleLoadHistory} disabled={loading}>
          {loading ? 'Loading...' : 'Load History'}
        </Button>
      </div>

      {messages.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          {loading ? 'Loading messages...' : 'No messages to display. Load history to see messages.'}
        </div>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {messages.map((message) => (
            <Card key={message.id} className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="font-medium text-sm">
                  {message.sender_name || message.sender_id}
                </div>
                <div className="text-xs text-gray-500">
                  {formatTimestamp(message.timestamp)}
                </div>
              </div>
              <div className="text-gray-700">{message.text}</div>
              <div className="flex gap-2 mt-2">
                <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                  {message.platform}
                </span>
                <span className="text-xs px-2 py-1 bg-gray-100 rounded">
                  {message.channel_id}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
