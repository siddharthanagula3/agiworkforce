import React, { useEffect, useState } from 'react';
import { websocketClient, CursorPosition } from '../../services/websocketClient';

interface CursorData extends CursorPosition {
  userId: string;
  color: string;
  userName?: string;
}

interface CollaborativeCursorsProps {
  resourceId: string;
}

const userColors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];

export const CollaborativeCursors: React.FC<CollaborativeCursorsProps> = ({ resourceId }) => {
  const [cursors, setCursors] = useState<Map<string, CursorData>>(new Map());

  useEffect(() => {
    const unsubscribe = websocketClient.on('CursorMoved', (event) => {
      const cursorEvent = event as {
        user_id: string;
        position: CursorPosition;
      };

      if (cursorEvent.user_id && cursorEvent.position) {
        setCursors((prev) => {
          const next = new Map(prev);
          const color = getUserColor(cursorEvent.user_id);

          next.set(cursorEvent.user_id, {
            ...cursorEvent.position,
            userId: cursorEvent.user_id,
            color,
            userName: getUserName(cursorEvent.user_id),
          });

          return next;
        });

        // Remove cursor after 5 seconds of inactivity
        setTimeout(() => {
          setCursors((prev) => {
            const next = new Map(prev);
            next.delete(cursorEvent.user_id);
            return next;
          });
        }, 5000);
      }
    });

    return unsubscribe;
  }, [resourceId]);

  const getUserColor = (userId: string): string => {
    const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return userColors[hash % userColors.length];
  };

  const getUserName = (userId: string): string => {
    // In a real implementation, fetch user name from a user service
    return userId.substring(0, 8);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {Array.from(cursors.values()).map((cursor) => (
        <Cursor
          key={cursor.userId}
          position={{ x: cursor.x, y: cursor.y }}
          color={cursor.color}
          label={cursor.userName || cursor.userId}
        />
      ))}
    </div>
  );
};

interface CursorProps {
  position: { x: number; y: number };
  color: string;
  label: string;
}

const Cursor: React.FC<CursorProps> = ({ position, color, label }) => {
  return (
    <div
      className="absolute transition-all duration-100 ease-out"
      style={{
        left: position.x,
        top: position.y,
        transform: 'translate(-2px, -2px)',
      }}
    >
      {/* Cursor SVG */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
      >
        <path
          d="M5.65376 12.3673L8.47618 15.4615L11.6341 10.1551L5.65376 12.3673Z"
          fill={color}
        />
        <path
          d="M4.5 5.11803L12.545 20.4615L11.6341 10.1551L4.5 5.11803Z"
          fill={color}
        />
      </svg>

      {/* User label */}
      <div
        className="absolute left-6 top-0 px-2 py-1 rounded text-xs text-white whitespace-nowrap font-medium"
        style={{
          backgroundColor: color,
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        }}
      >
        {label}
      </div>
    </div>
  );
};
