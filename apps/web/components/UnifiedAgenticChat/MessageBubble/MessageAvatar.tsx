/**
 * MessageAvatar Component
 *
 * Renders the avatar for a message based on role.
 */

import React, { memo, useMemo } from 'react';

export interface MessageAvatarProps {
  isUser: boolean;
  isSystem: boolean;
}

const MessageAvatarComponent: React.FC<MessageAvatarProps> = ({ isUser, isSystem }) => {
  const avatarBg = useMemo(
    () =>
      isUser
        ? 'bg-blue-600'
        : isSystem
          ? 'bg-muted-foreground'
          : 'bg-gradient-to-br from-amber-500 to-orange-600',
    [isUser, isSystem],
  );

  const label = useMemo(() => {
    if (isSystem) return 'S';
    return 'AI';
  }, [isSystem]);

  return (
    <div
      className={`shrink-0 w-8 h-8 rounded-full ${avatarBg} flex items-center justify-center text-white text-sm font-medium`}
    >
      {label}
    </div>
  );
};

MessageAvatarComponent.displayName = 'MessageAvatar';

export const MessageAvatar = memo(MessageAvatarComponent);
