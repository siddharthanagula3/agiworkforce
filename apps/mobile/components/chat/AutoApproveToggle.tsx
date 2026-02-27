import { Pressable } from 'react-native';
import { Shield, ShieldCheck, ShieldAlert } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '@/stores/settingsStore';
import type { AutoApproveMode } from '@/types/chat';

const modeConfig: Record<AutoApproveMode, { icon: typeof Shield; color: string; label: string }> = {
  ask: { icon: ShieldCheck, color: '#10b981', label: 'Ask Always' },
  smart: { icon: Shield, color: '#f59e0b', label: 'Smart Auto' },
  full: { icon: ShieldAlert, color: '#ef4444', label: 'Full Auto' },
};

const modeOrder: AutoApproveMode[] = ['ask', 'smart', 'full'];

export function AutoApproveToggle() {
  const { autoApproveMode, setAutoApproveMode, hapticsEnabled } = useSettingsStore();

  const cycleMode = () => {
    const currentIndex = modeOrder.indexOf(autoApproveMode);
    const nextMode = modeOrder[(currentIndex + 1) % modeOrder.length];
    setAutoApproveMode(nextMode);
    if (hapticsEnabled) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const config = modeConfig[autoApproveMode];
  const Icon = config.icon;

  return (
    <Pressable
      onPress={cycleMode}
      className="p-1.5 rounded-lg active:bg-white/5"
      accessibilityLabel={`Auto-approve: ${config.label}`}
      accessibilityHint="Tap to cycle approval mode"
    >
      <Icon size={20} color={config.color} />
    </Pressable>
  );
}
