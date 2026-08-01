import Animated, { FadeIn } from 'react-native-reanimated';
import { View, ActivityIndicator } from 'react-native';
import { QrCode, Wifi, WifiOff, Clock, ShieldCheck } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useThemeColors } from '@/src/ui/theme';

export function SessionExpiredView({ onRePair }: { onRePair: () => void }) {
  const colors = useThemeColors();
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-1 items-center justify-center px-8"
    >
      <View className="w-20 h-20 rounded-2xl bg-amber-500/10 items-center justify-center mb-6">
        <Clock size={36} color={colors.agentWarning} />
      </View>

      <Text variant="subheading" className="text-center mb-2">
        Session Expired
      </Text>
      <Text className="text-white/50 text-center text-sm mb-6 leading-5">
        Your pairing session has expired. Scan a new QR code from the desktop app to reconnect.
      </Text>

      <Button
        title="Scan New QR Code"
        variant="primary"
        size="lg"
        onPress={onRePair}
        className="w-full"
      />
    </Animated.View>
  );
}

export function DisconnectedView({ onScanPress }: { onScanPress: () => void }) {
  const colors = useThemeColors();
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-1 items-center justify-center px-8"
    >
      <View className="w-24 h-24 rounded-3xl bg-white/5 items-center justify-center mb-6">
        <QrCode size={44} color={colors.teal} />
      </View>

      <Text variant="heading" className="text-center mb-2">
        Pair with Desktop
      </Text>
      <Text className="text-white/50 text-center text-sm mb-8 leading-5">
        Scan the QR code shown in your AGI Workforce desktop app to connect and control your agents
        remotely.
      </Text>

      <View
        accessibilityRole="text"
        accessibilityLabel="Desktop setup requirement. Sign in on Desktop and switch to Managed Cloud before generating a code. The short-lived pairing code authorizes this phone; accounts are not compared."
        className="w-full rounded-2xl border border-teal-500/20 bg-teal-500/10 px-4 py-3 mb-5"
      >
        <View className="flex-row items-center gap-2 mb-1.5">
          <ShieldCheck size={15} color={colors.teal} />
          <Text className="text-sm font-semibold text-white">Desktop setup required</Text>
        </View>
        <Text className="text-xs text-white/60 leading-5">
          Sign in on Desktop and switch to Managed Cloud before generating a code. The short-lived
          QR or pairing code authorizes this phone; the apps do not compare account identities.
        </Text>
      </View>

      <Button
        title="Scan QR Code"
        variant="primary"
        size="lg"
        onPress={onScanPress}
        className="w-full mb-3"
      />

      <View className="flex-row items-center gap-3 mt-6 px-4">
        <View className="flex-1 h-px bg-white/10" />
        <Text className="text-xs text-white/30">HOW IT WORKS</Text>
        <View className="flex-1 h-px bg-white/10" />
      </View>

      <View className="mt-5 gap-4 w-full">
        <StepRow number={1} text="Open Desktop in Managed Cloud" />
        <StepRow number={2} text='Go to Settings and select "Connections"' />
        <StepRow number={3} text="Generate and scan the short-lived code" />
      </View>
    </Animated.View>
  );
}

function StepRow({ number, text }: { number: number; text: string }) {
  return (
    <View className="flex-row items-center gap-3">
      <View className="w-7 h-7 rounded-full bg-teal-500/20 items-center justify-center">
        <Text className="text-xs font-bold text-teal-400">{number}</Text>
      </View>
      <Text className="text-sm text-white/60 flex-1">{text}</Text>
    </View>
  );
}

export function ConnectingView() {
  const colors = useThemeColors();
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-1 items-center justify-center px-8"
    >
      <View className="w-20 h-20 rounded-2xl bg-amber-500/10 items-center justify-center mb-6">
        <Wifi size={36} color={colors.agentWarning} />
      </View>

      <Text variant="subheading" className="text-center mb-2">
        Connecting to Desktop...
      </Text>
      <Text className="text-white/50 text-center text-sm mb-6">
        Keep both apps open and online. They can connect across different networks.
      </Text>
      <ActivityIndicator size="small" color={colors.teal} />
    </Animated.View>
  );
}

export function ErrorView({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const colors = useThemeColors();
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-1 items-center justify-center px-8"
    >
      <View className="w-20 h-20 rounded-2xl bg-red-500/10 items-center justify-center mb-6">
        <WifiOff size={36} color={colors.agentError} />
      </View>

      <Text variant="subheading" className="text-center mb-2">
        Connection Failed
      </Text>
      <Text className="text-white/50 text-center text-sm mb-6">
        {error ?? 'Unable to connect to the desktop.'}
      </Text>

      <Button title="Try Again" variant="primary" size="md" onPress={onRetry} className="w-48" />
    </Animated.View>
  );
}
