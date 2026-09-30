import { useState } from 'react';
import Animated, { FadeIn } from 'react-native-reanimated';
import { View, ActivityIndicator, ScrollView } from 'react-native';
import { PressableBox } from '@/components/ui/pressable-box';
import {
  QrCode,
  Wifi,
  WifiOff,
  Clock,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useThemeColors, motion } from '@/src/ui/theme';
import { PairingRiskDisclosure } from './PairingRiskDisclosure';

export function SessionExpiredView({ onRePair }: { onRePair: () => void }) {
  const colors = useThemeColors();
  return (
    <Animated.View
      entering={FadeIn.duration(motion.moved)}
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

export function DisconnectedView({
  onScanPress,
  onShowSetupSteps,
}: {
  onScanPress: () => void;
  onShowSetupSteps?: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Animated.View entering={FadeIn.duration(motion.moved)} className="flex-1">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 32,
          paddingBottom: 32,
          flexGrow: 1,
          justifyContent: 'center',
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="items-center">
          <View className="w-24 h-24 rounded-3xl bg-white/5 items-center justify-center mb-6">
            <QrCode size={44} color={colors.teal} />
          </View>

          <Text variant="heading" className="text-center mb-2">
            Pair with Desktop
          </Text>
          <Text className="text-white/50 text-center text-sm mb-6 leading-5">
            Scan the QR code shown in your AGI Workforce desktop app to connect and control your
            agents remotely.
          </Text>
        </View>

        <View
          accessibilityRole="text"
          accessibilityLabel="Desktop setup requirement. Sign in on Desktop and switch to Managed Cloud before generating a code. The short-lived pairing code authorizes this phone; accounts are not compared."
          className="w-full rounded-2xl border px-4 py-3 mb-5"
          style={{ borderColor: colors.accentBorder, backgroundColor: colors.accentSurface }}
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

        {/*
          PAR-M28: the prerequisites used to render BELOW the primary CTA under
          a "HOW IT WORKS" divider, scan first, read later. They now precede
          the button, and the risk disclosure follows it, so no path reaches
          the scanner without both being on screen first.
        */}
        <PairingChecklist
          className="mb-8"
          steps={[
            'Open Desktop in Managed Cloud',
            'Go to Settings, select Capabilities and choose "Pair a phone"',
            'Generate and scan the short-lived code',
          ]}
        />

        <Button
          title="Scan QR Code"
          variant="primary"
          size="lg"
          onPress={onScanPress}
          className="w-full"
        />

        {onShowSetupSteps ? (
          <PressableBox
            accessibilityRole="button"
            accessibilityLabel="Show desktop setup steps again"
            onPress={onShowSetupSteps}
            style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: colors.teal }}>Show desktop setup steps again</Text>
          </PressableBox>
        ) : null}

        <PairingRiskDisclosure className="mt-4" />
      </ScrollView>
    </Animated.View>
  );
}

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
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center gap-3">
      <View
        className="w-7 h-7 rounded-full items-center justify-center"
        style={{ backgroundColor: colors.accentSurface }}
      >
        <Text className="text-xs font-bold" style={{ color: colors.teal }}>
          {number}
        </Text>
      </View>
      <Text className="text-sm text-white/60 flex-1">{text}</Text>
    </View>
  );
}

export function ConnectingView({ onCancel }: { onCancel: () => void }) {
  const colors = useThemeColors();
  return (
    <Animated.View
      entering={FadeIn.duration(motion.moved)}
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

  return (
    <Animated.View
      entering={FadeIn.duration(motion.moved)}
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
          'Remote Control is on in Desktop → Settings → Capabilities',
          'Desktop is signed in and in Managed Cloud',
          'Use a new pairing code from Desktop; phone and Desktop accounts do not need to match',
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
          <PressableBox
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
          </PressableBox>
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
