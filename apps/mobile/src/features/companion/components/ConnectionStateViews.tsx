import { useState } from 'react';
import Animated, { FadeIn } from 'react-native-reanimated';
import { View, ActivityIndicator, Pressable } from 'react-native';
import {
  QrCode,
  Wifi,
  WifiOff,
  Clock,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
} from 'lucide-react-native';
import { useUser } from '@clerk/expo';
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

      <PairingChecklist
        className="mt-5"
        steps={[
          'Open Desktop in Managed Cloud',
          'Go to Settings and select "Connections"',
          'Generate and scan the short-lived code',
        ]}
      />
    </Animated.View>
  );
}

/**
 * Numbered prerequisites for a pairing attempt. Shared by the pre-pair
 * explainer and the failure screen: the same three things are worth checking
 * before you scan and after a scan fails, and before PAR-M14 the list only
 * existed in the DISCONNECTED view — unreachable once the status flipped to
 * 'error'.
 */
export function PairingChecklist({ steps, className }: { steps: string[]; className?: string }) {
  return (
    <View className={`gap-4 w-full${className ? ` ${className}` : ''}`}>
      {steps.map((step, index) => (
        <StepRow key={step} number={index + 1} text={step} />
      ))}
    </View>
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

export function ConnectingView({ onCancel }: { onCancel: () => void }) {
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

      <Button title="Cancel" variant="ghost" size="md" onPress={onCancel} className="mt-6 w-48" />
    </Animated.View>
  );
}

export function ErrorView({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const colors = useThemeColors();
  const [detailsOpen, setDetailsOpen] = useState(false);
  // useAuthStore().user is always null in v1 — Clerk is the real signed-in user
  // source (same pattern as src/features/settings/cloud-account/index.tsx:47).
  const { user } = useUser();
  const accountEmail = user?.primaryEmailAddress?.emailAddress ?? null;

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      className="flex-1 items-center justify-center px-8"
    >
      <View className="w-20 h-20 rounded-2xl bg-red-500/10 items-center justify-center mb-6">
        <WifiOff size={36} color={colors.agentError} />
      </View>

      <Text variant="subheading" className="text-center mb-2">
        Pairing failed
      </Text>
      <Text className="text-white/50 text-center text-sm mb-6">
        A few things to check on your computer:
      </Text>

      <PairingChecklist
        steps={[
          'Dispatch is turned on in Desktop → Settings → Connections',
          accountEmail
            ? `You're signed in as ${accountEmail}`
            : "You're signed in on Desktop with the account you use here",
          'Desktop is open and up to date',
        ]}
      />

      <Button
        title="Try Again"
        variant="primary"
        size="md"
        onPress={onRetry}
        className="w-48 mt-8"
      />

      {error && (
        <View className="w-full mt-4">
          <Pressable
            onPress={() => setDetailsOpen((open) => !open)}
            className="flex-row items-center justify-center gap-1 py-2"
            accessibilityRole="button"
            accessibilityLabel={detailsOpen ? 'Hide error details' : 'Show error details'}
            accessibilityState={{ expanded: detailsOpen }}
          >
            {detailsOpen ? (
              <ChevronDown size={14} color={colors.textMuted} />
            ) : (
              <ChevronRight size={14} color={colors.textMuted} />
            )}
            <Text className="text-xs text-white/40">Details</Text>
          </Pressable>
          {detailsOpen && (
            <Text className="text-xs text-white/40 text-center leading-5" selectable>
              {error}
            </Text>
          )}
        </View>
      )}
    </Animated.View>
  );
}
