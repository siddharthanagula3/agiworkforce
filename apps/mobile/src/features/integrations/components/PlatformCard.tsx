import { View, Pressable } from 'react-native';
import { MessageCircle, Send, Hash, Mail, Settings, Zap, Monitor } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useThemeColors } from '@/src/ui/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessagingPlatformId =
  | 'slack'
  | 'teams'
  | 'discord'
  | 'whatsapp'
  | 'telegram'
  | 'gmail'
  | 'outlook';

export interface PlatformInfo {
  name: string;
  icon: MessagingPlatformId;
  connected: boolean;
  accountName?: string;
  lastSynced?: string;
  messageCount?: number;
}

interface PlatformCardProps {
  platform: PlatformInfo;
  onConnect: () => void;
  onDisconnect: () => void;
  onConfigure?: () => void;
}

// ---------------------------------------------------------------------------
// Icon + colour registry for each platform
// ---------------------------------------------------------------------------

type IconComponent = typeof MessageCircle;

const platformMeta: Record<
  MessagingPlatformId,
  { Icon: IconComponent; tone: 'active' | 'success' | 'warning' | 'error' | 'purple' }
> = {
  slack: {
    Icon: Hash,
    tone: 'purple',
  },
  teams: {
    Icon: Monitor,
    tone: 'active',
  },
  discord: {
    Icon: Zap,
    tone: 'active',
  },
  whatsapp: {
    Icon: MessageCircle,
    tone: 'success',
  },
  telegram: {
    Icon: Send,
    tone: 'active',
  },
  gmail: {
    Icon: Mail,
    tone: 'error',
  },
  outlook: {
    Icon: Mail,
    tone: 'active',
  },
};

function resolveToneColors(
  tone: (typeof platformMeta)[MessagingPlatformId]['tone'],
  colors: ReturnType<typeof useThemeColors>,
): { icon: string; surface: string } {
  switch (tone) {
    case 'active':
      return { icon: colors.agentActive, surface: colors.accentSurface };
    case 'success':
      return { icon: colors.agentSuccess, surface: colors.successSurface };
    case 'warning':
      return { icon: colors.agentWarning, surface: colors.warningSurface };
    case 'error':
      return { icon: colors.agentError, surface: colors.dangerSurface };
    case 'purple':
      return { icon: colors.purple, surface: colors.purpleSurface };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format an ISO date string as a relative time, e.g. "2h ago". */
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlatformCard({
  platform,
  onConnect,
  onDisconnect,
  onConfigure,
}: PlatformCardProps) {
  const colors = useThemeColors();
  const meta = platformMeta[platform.icon];
  const { Icon, tone } = meta;
  const toneColors = resolveToneColors(tone, colors);

  return (
    <Card variant="elevated" className="mb-3">
      {/* Header row: icon + name + status badge + settings gear */}
      <View className="flex-row items-center gap-3 mb-3">
        <View
          className="w-10 h-10 rounded-xl items-center justify-center"
          style={{ backgroundColor: toneColors.surface }}
        >
          <Icon size={20} color={toneColors.icon} />
        </View>

        <View className="flex-1">
          <Text className="text-sm font-medium text-white">{platform.name}</Text>
          <View className="flex-row items-center gap-1.5 mt-0.5">
            {/* Animated dot */}
            <View
              className={`w-2 h-2 rounded-full ${platform.connected ? 'bg-emerald-400' : 'bg-white/25'}`}
            />
            <Badge
              label={platform.connected ? 'Connected' : 'Not Connected'}
              color={platform.connected ? 'green' : 'gray'}
            />
          </View>
        </View>

        {/* Settings gear — visible only when connected */}
        {platform.connected && onConfigure && (
          <Pressable
            onPress={onConfigure}
            className="p-2 rounded-lg active:bg-white/5"
            accessibilityLabel={`Configure ${platform.name}`}
          >
            <Settings size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Details row (connected state) */}
      {platform.connected && (
        <View className="mb-3 gap-1.5">
          {platform.accountName ? (
            <View className="flex-row items-center gap-1.5">
              <Text className="text-[10px] text-white/40 uppercase tracking-wider">Account</Text>
              <Text className="text-xs font-medium text-white/70">{platform.accountName}</Text>
            </View>
          ) : null}

          {platform.lastSynced ? (
            <View className="flex-row items-center gap-1.5">
              <Text className="text-[10px] text-white/40 uppercase tracking-wider">Synced</Text>
              <Text className="text-xs font-medium text-white/70">
                {formatRelativeTime(platform.lastSynced)}
              </Text>
            </View>
          ) : null}

          {platform.messageCount !== undefined && platform.messageCount > 0 ? (
            <View className="flex-row items-center gap-1.5">
              <Text className="text-[10px] text-white/40 uppercase tracking-wider">Messages</Text>
              <Text className="text-xs font-medium text-white/70">
                {platform.messageCount.toLocaleString()}
              </Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Action button */}
      {platform.connected ? (
        <Button title="Disconnect" variant="destructive" size="sm" onPress={onDisconnect} />
      ) : (
        <Button title="Connect" variant="primary" size="sm" onPress={onConnect} />
      )}
    </Card>
  );
}
