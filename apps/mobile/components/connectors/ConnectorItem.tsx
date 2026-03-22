/**
 * ConnectorItem.tsx
 *
 * Individual connector row for the Connectors page.
 *
 * Two visual states:
 * - Connected:  toggle switch (teal when ON)
 * - Available:  "Connect" outline button
 */

import { View, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { colors } from '@/lib/theme';
import { CONNECTOR_META } from './connectorData';
import { useSettingsStore } from '@/stores/settingsStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConnectorItemProps {
  id: string;
  name: string;
  description: string;
  isConnected: boolean;
  isEnabled: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onConnect: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Fallback icon letter — first letter of the service name in a colored circle
// ---------------------------------------------------------------------------

function FallbackIcon({ name, color }: { name: string; color: string }) {
  return (
    <View
      className="w-10 h-10 rounded-xl items-center justify-center"
      style={{ backgroundColor: `${color}20` }}
    >
      <Text className="text-base font-bold" style={{ color }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConnectorItem({
  id,
  name,
  description,
  isConnected,
  isEnabled,
  onToggle,
  onConnect,
}: ConnectorItemProps) {
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const meta = CONNECTOR_META[id];

  const handleConnect = () => {
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onConnect(id);
  };

  // Render the icon (lucide icon in a tinted circle)
  const renderIcon = () => {
    if (!meta) {
      return <FallbackIcon name={name} color={colors.teal} />;
    }

    const Icon = meta.icon;
    return (
      <View
        className="w-10 h-10 rounded-xl items-center justify-center"
        style={{ backgroundColor: meta.bgColor }}
      >
        <Icon size={20} color={meta.color} />
      </View>
    );
  };

  return (
    <View className="flex-row items-center py-3 px-4">
      {/* Icon */}
      {renderIcon()}

      {/* Name + description */}
      <View className="flex-1 ml-3 mr-3">
        <Text className="text-[15px] font-medium text-white">{name}</Text>
        <Text
          className="text-[13px] leading-[18px] mt-0.5"
          style={{ color: colors.textMuted }}
          numberOfLines={2}
        >
          {description}
        </Text>
      </View>

      {/* Right side: Toggle or Connect button */}
      {isConnected ? (
        <Switch value={isEnabled} onValueChange={(val) => onToggle(id, val)} />
      ) : (
        <Pressable
          onPress={handleConnect}
          className="px-4 h-8 rounded-lg items-center justify-center border active:opacity-70"
          style={{ borderColor: colors.teal }}
          accessibilityLabel={`Connect ${name}`}
          accessibilityRole="button"
        >
          <Text className="text-[13px] font-medium" style={{ color: colors.teal }}>
            Connect
          </Text>
        </Pressable>
      )}
    </View>
  );
}
