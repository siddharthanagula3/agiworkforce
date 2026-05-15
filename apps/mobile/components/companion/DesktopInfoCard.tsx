import Animated, { SlideInDown } from 'react-native-reanimated';
import { View, Pressable } from 'react-native';
import { Monitor, Cpu, HardDrive, Unlink } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AgentDashboard } from '@/components/companion/AgentDashboard';
import { colors } from '@/lib/theme';

interface DesktopInfoCardProps {
  desktopName: string | null;
  desktopMetadata: Record<string, unknown> | null;
  onDisconnect: () => void;
}

export function DesktopInfoCard({
  desktopName,
  desktopMetadata,
  onDisconnect,
}: DesktopInfoCardProps) {
  return (
    <Animated.View entering={SlideInDown.duration(300).springify()} className="flex-1">
      <View className="px-4 mb-3">
        <Card variant="elevated">
          <View className="flex-row items-center gap-3 mb-3">
            <View className="w-10 h-10 rounded-xl bg-teal-500/20 items-center justify-center">
              <Monitor size={20} color={colors.teal} />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-medium text-white">{desktopName ?? 'Desktop'}</Text>
              <Text className="text-xs text-white/40">
                {desktopMetadata?.platform ? `${desktopMetadata.platform}` : 'Connected'}
                {desktopMetadata?.version ? ` v${desktopMetadata.version}` : ''}
              </Text>
            </View>
            <Badge label="Paired" color="teal" />
          </View>

          {desktopMetadata?.os != null && (
            <>
              <Separator className="my-2" />
              <View className="flex-row items-center gap-4">
                <View className="flex-row items-center gap-1.5">
                  <Cpu size={12} color={colors.textMuted} />
                  <Text className="text-[10px] text-white/40">{String(desktopMetadata.os)}</Text>
                </View>
                {desktopMetadata.arch != null && (
                  <View className="flex-row items-center gap-1.5">
                    <HardDrive size={12} color={colors.textMuted} />
                    <Text className="text-[10px] text-white/40">
                      {String(desktopMetadata.arch)}
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </Card>
      </View>

      <View className="flex-1">
        <AgentDashboard />
      </View>

      <View className="px-4 pb-4 pt-2">
        <Pressable
          onPress={onDisconnect}
          className="flex-row items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 active:bg-red-500/20"
        >
          <Unlink size={16} color={colors.agentError} />
          <Text className="text-sm text-red-400 font-medium">Disconnect</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
