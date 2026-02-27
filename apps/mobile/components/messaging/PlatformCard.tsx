import { View, Pressable } from 'react-native';
import { MessageCircle, Send, Hash } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConnectedBadge } from './ConnectedBadge';
import { colors } from '@/lib/theme';
import type { MessagingPlatform } from '@/stores/messagingStore';

interface PlatformCardProps {
  platform: MessagingPlatform;
  onConnect: () => void;
  onDisconnect: () => void;
}

const platformIcons: Record<
  MessagingPlatform['id'],
  { Icon: typeof MessageCircle; color: string; bgClass: string }
> = {
  whatsapp: {
    Icon: MessageCircle,
    color: '#25D366',
    bgClass: 'bg-emerald-500/15',
  },
  telegram: {
    Icon: Send,
    color: '#0088cc',
    bgClass: 'bg-blue-500/15',
  },
  slack: {
    Icon: Hash,
    color: '#7C3AED',
    bgClass: 'bg-purple-500/15',
  },
};

export function PlatformCard({
  platform,
  onConnect,
  onDisconnect,
}: PlatformCardProps) {
  const { Icon, color, bgClass } = platformIcons[platform.id];
  const { messagesSent, messagesReceived } = platform.stats;
  const hasStats = messagesSent > 0 || messagesReceived > 0;

  return (
    <Card variant="elevated" className="mb-3">
      {/* Header row: icon + name + status */}
      <View className="flex-row items-center gap-3 mb-3">
        <View
          className={`w-10 h-10 rounded-xl items-center justify-center ${bgClass}`}
        >
          <Icon size={20} color={color} />
        </View>

        <View className="flex-1">
          <Text className="text-sm font-medium text-white">
            {platform.name}
          </Text>
          <ConnectedBadge
            status={platform.connected ? 'connected' : 'disconnected'}
          />
        </View>
      </View>

      {/* Stats row (only when connected and has data) */}
      {platform.connected && hasStats && (
        <View className="flex-row items-center gap-4 mb-3 px-1">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-[10px] text-white/40 uppercase tracking-wider">
              Sent
            </Text>
            <Text className="text-xs font-medium text-white/70">
              {messagesSent}
            </Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <Text className="text-[10px] text-white/40 uppercase tracking-wider">
              Received
            </Text>
            <Text className="text-xs font-medium text-white/70">
              {messagesReceived}
            </Text>
          </View>
          {platform.stats.lastActive && (
            <View className="flex-row items-center gap-1.5">
              <Text className="text-[10px] text-white/40 uppercase tracking-wider">
                Last active
              </Text>
              <Text className="text-xs font-medium text-white/70">
                {formatRelativeTime(platform.stats.lastActive)}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Action button */}
      {platform.connected ? (
        <Button
          title="Disconnect"
          variant="destructive"
          size="sm"
          onPress={onDisconnect}
        />
      ) : (
        <Button
          title="Connect"
          variant="primary"
          size="sm"
          onPress={onConnect}
        />
      )}
    </Card>
  );
}

/** Format an ISO date string as a relative time (e.g., "2h ago"). */
function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(isoDate).toLocaleDateString();
}
