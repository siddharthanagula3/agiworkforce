import React, { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { websocketClient, UserPresence } from '../../services/websocketClient';

interface PresenceIndicatorProps {
  teamId: string;
}

const statusColors = {
  Online: 'bg-green-500',
  Away: 'bg-yellow-500',
  Busy: 'bg-red-500',
  Offline: 'bg-gray-400',
};

const statusLabels = {
  Online: 'Online',
  Away: 'Away',
  Busy: 'Busy',
  Offline: 'Offline',
};

export const PresenceIndicator: React.FC<PresenceIndicatorProps> = ({ teamId }) => {
  const [presence, setPresence] = useState<UserPresence[]>([]);

  const loadPresence = useCallback(async () => {
    try {
      const teamPresence = await invoke<UserPresence[]>('get_team_presence', { teamId });
      setPresence(teamPresence);
    } catch (error) {
      console.error('Failed to load team presence:', error);
    }
  }, [teamId]);

  useEffect(() => {
    loadPresence();

    // Subscribe to presence updates
    const unsubscribe = websocketClient.on('UserPresenceChanged', (event) => {
      updatePresenceState(event as unknown as { user_id: string; status: UserPresence['status'] });
    });

    // Refresh presence every 30 seconds
    const interval = setInterval(() => {
      loadPresence();
    }, 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [loadPresence]);

  const updatePresenceState = (event: { user_id: string; status: UserPresence['status'] }) => {
    setPresence((prev) => {
      const updated = [...prev];
      const index = updated.findIndex((p) => p.user_id === event.user_id);

      if (index >= 0) {
        updated[index] = {
          ...updated[index],
          user_id: event.user_id,
          status: event.status,
          last_seen: Date.now(),
        };
      }

      return updated;
    });
  };

  const onlineUsers = presence.filter((p) => p.status === 'Online');

  return (
    <div className="flex items-center space-x-3">
      <div className="flex -space-x-2">
        {onlineUsers.slice(0, 5).map((p) => (
          <div
            key={p.user_id}
            className="relative inline-block"
            title={`${p.user_id} - ${statusLabels[p.status]}`}
          >
            <div className="w-8 h-8 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center text-white text-xs font-semibold">
              {p.user_id.substring(0, 2).toUpperCase()}
            </div>
            <span
              className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                statusColors[p.status]
              }`}
            />
          </div>
        ))}
      </div>

      {onlineUsers.length > 5 && (
        <span className="text-sm text-gray-600">+{onlineUsers.length - 5} more</span>
      )}

      {onlineUsers.length === 0 && (
        <span className="text-sm text-gray-500">No one else is online</span>
      )}
    </div>
  );
};
