import Animated, { SlideInDown } from 'react-native-reanimated';
import { View } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import { Monitor, Cpu, HardDrive, Unlink } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AgentDashboard } from '@/src/features/companion/components/AgentDashboard';
import { CodeSessionsCard } from './CodeSessionsCard';
import { DispatchTaskComposer } from '@/src/features/companion/components/DispatchTaskComposer';
import { useThemeColors, motion } from '@/src/ui/theme';
import { RemoteWorkspaceBoundaryNotice } from './RemoteWorkspaceBoundaryNotice';
import { SingleDesktopSessionNotice } from './SingleDesktopSessionNotice';

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
  const colors = useThemeColors();
  return (
    <Animated.View entering={SlideInDown.duration(motion.moved).springify()} className="flex-1">
      <View className="px-4 mb-3">
        <Card variant="elevated">
          <View className="flex-row items-center gap-3 mb-3">
            <View
              className="w-10 h-10 rounded-xl items-center justify-center"
              style={{ backgroundColor: colors.accentSurface }}
            >
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
                  <Text className="text-xs text-white/40">{String(desktopMetadata.os)}</Text>
                </View>
                {desktopMetadata.arch != null && (
                  <View className="flex-row items-center gap-1.5">
                    <HardDrive size={12} color={colors.textMuted} />
                    <Text className="text-xs text-white/40">{String(desktopMetadata.arch)}</Text>
                  </View>
                )}
              </View>
            </>
          )}
        </Card>
      </View>

      <SingleDesktopSessionNotice />
      <RemoteWorkspaceBoundaryNotice />

      {Array.isArray(desktopMetadata?.capabilities) &&
      desktopMetadata.capabilities.includes('code-sessions') ? (
        <CodeSessionsCard canStart={desktopMetadata.capabilities.includes('code-session-start')} />
      ) : null}

      <DispatchTaskComposer />

      <View className="flex-1">
        <AgentDashboard />
      </View>

      <View className="px-4 pb-4 pt-2">
        <PressableBox
          onPress={onDisconnect}
          className="flex-row items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 active:bg-red-500/20"
        >
          <Unlink size={16} color={colors.agentError} />
          <Text className="text-sm text-red-400 font-medium">Disconnect</Text>
        </PressableBox>
      </View>
    </Animated.View>
  );
}
