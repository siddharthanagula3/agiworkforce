/**
 * Companion Demo Walkthrough
 *
 * Lightweight tooltip overlay that guides users through the companion feature.
 * Four steps: Pair, Monitor, Approve, Remote Control.
 *
 * Usage:
 *   <CompanionDemoWalkthrough
 *     visible={showDemo}
 *     onDone={() => setShowDemo(false)}
 *   />
 *
 * Trigger from settings or on first successful pairing.
 */
import { useCallback, useState } from 'react';
import { View, Pressable, Modal, Dimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import {
  QrCode,
  Bot,
  ShieldCheck,
  Pause,
  ChevronRight,
  X,
  CheckCircle2,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/mmkv';

// ---------------------------------------------------------------------------
// Demo Step definitions
// ---------------------------------------------------------------------------

interface DemoStep {
  id: string;
  icon: typeof QrCode;
  iconBgColor: string;
  iconColor: string;
  stepNumber: number;
  title: string;
  description: string;
  hint: string;
}

const DEMO_STEPS: DemoStep[] = [
  {
    id: 'pair',
    icon: QrCode,
    iconBgColor: 'rgba(33, 128, 141, 0.15)',
    iconColor: colors.teal,
    stepNumber: 1,
    title: 'Pair with Desktop',
    description:
      'Open AGI Workforce on your desktop and go to Settings > Mobile Companion. A QR code will appear — tap "Scan QR Code" on this screen to pair.',
    hint: 'Pairing is instant once both devices are on the same network.',
  },
  {
    id: 'monitor',
    icon: Bot,
    iconBgColor: 'rgba(59, 130, 246, 0.15)',
    iconColor: colors.agentActive,
    stepNumber: 2,
    title: 'Monitor Agents',
    description:
      'Once paired, the Agent Dashboard shows all running tasks. You can see progress, current action, step counts, and estimated time remaining for each agent.',
    hint: 'Tap an agent card to expand details. Tap the arrow to see the full run log.',
  },
  {
    id: 'approve',
    icon: ShieldCheck,
    iconBgColor: 'rgba(16, 185, 129, 0.15)',
    iconColor: colors.agentSuccess,
    stepNumber: 3,
    title: 'Approve Actions',
    description:
      'When an agent wants to delete files, run commands, or call APIs, an approval card appears. You can review the risk level and approve or deny directly from your phone.',
    hint: 'High-risk actions trigger a push notification so you never miss a critical decision.',
  },
  {
    id: 'remote_control',
    icon: Pause,
    iconBgColor: 'rgba(245, 158, 11, 0.15)',
    iconColor: colors.agentWarning,
    stepNumber: 4,
    title: 'Remote Control',
    description:
      'Pause, resume, or cancel any running agent from your phone. In an emergency, the red "Emergency Stop" button cancels ALL running tasks on the desktop instantly.',
    hint: 'Agent controls appear when you tap a running agent card.',
  },
];

// ---------------------------------------------------------------------------
// Demo state store (tracks if user has seen the walkthrough)
// ---------------------------------------------------------------------------

interface DemoState {
  hasSeenDemo: boolean;
  markDemoSeen: () => void;
  resetDemo: () => void;
}

export const useDemoStore = create<DemoState>()(
  persist(
    (set) => ({
      hasSeenDemo: false,
      markDemoSeen: () => set({ hasSeenDemo: true }),
      resetDemo: () => set({ hasSeenDemo: false }),
    }),
    {
      name: 'companion-demo-store',
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);

// ---------------------------------------------------------------------------
// Step Indicator dots
// ---------------------------------------------------------------------------

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <View className="flex-row items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          className="rounded-full"
          style={{
            width: i === current ? 16 : 6,
            height: 6,
            backgroundColor:
              i === current
                ? colors.teal
                : i < current
                  ? `${colors.teal}60`
                  : 'rgba(255,255,255,0.15)',
          }}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Demo Walkthrough component
// ---------------------------------------------------------------------------

interface CompanionDemoWalkthroughProps {
  visible: boolean;
  onDone: () => void;
}

export function CompanionDemoWalkthrough({ visible, onDone }: CompanionDemoWalkthroughProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const markDemoSeen = useDemoStore((s) => s.markDemoSeen);

  const step = DEMO_STEPS[currentStep];
  const isLast = currentStep === DEMO_STEPS.length - 1;

  const handleNext = useCallback(() => {
    if (isLast) {
      markDemoSeen();
      onDone();
      // Reset for next time
      setCurrentStep(0);
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  }, [isLast, markDemoSeen, onDone]);

  const handleSkip = useCallback(() => {
    markDemoSeen();
    onDone();
    setCurrentStep(0);
  }, [markDemoSeen, onDone]);

  const handlePrev = useCallback(() => {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }, []);

  if (!visible) return null;

  const { width: screenWidth } = Dimensions.get('window');
  const Icon = step.icon;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleSkip}
    >
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          justifyContent: 'flex-end',
        }}
      >
        {/* Dismiss tap zone (above the card) */}
        <Pressable
          style={{ flex: 1 }}
          onPress={handleSkip}
          accessibilityLabel="Dismiss walkthrough"
          accessibilityRole="button"
        />

        {/* Bottom sheet tooltip card */}
        <Animated.View
          entering={SlideInDown.duration(350).springify()}
          exiting={SlideOutDown.duration(250)}
          style={{
            backgroundColor: '#1a1a1a',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 24,
            paddingBottom: 40,
            paddingTop: 24,
            borderTopWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            maxWidth: screenWidth,
          }}
        >
          {/* Handle + dismiss row */}
          <View className="flex-row items-center justify-between mb-5">
            <View className="w-10 h-1 rounded-full bg-white/20 mx-auto" style={{ flex: 0 }} />
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={handleSkip}
              className="p-1.5 rounded-full bg-white/5 active:bg-white/10"
              accessibilityLabel="Skip walkthrough"
              accessibilityRole="button"
            >
              <X size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Step icon */}
          <View className="items-center mb-5">
            <View
              className="w-16 h-16 rounded-2xl items-center justify-center mb-3"
              style={{ backgroundColor: step.iconBgColor }}
            >
              <Icon size={28} color={step.iconColor} />
            </View>
            <View className="px-2 py-0.5 rounded-full bg-teal-500/15">
              <Text className="text-[10px] font-semibold text-teal-400 uppercase tracking-wider">
                Step {step.stepNumber} of {DEMO_STEPS.length}
              </Text>
            </View>
          </View>

          {/* Content */}
          <Text className="text-[17px] font-bold text-white text-center mb-3">{step.title}</Text>
          <Text className="text-sm text-white/60 text-center leading-5 mb-4">
            {step.description}
          </Text>

          {/* Hint pill */}
          <View className="flex-row items-start gap-2 px-4 py-3 rounded-xl bg-white/5 mb-6">
            <Text className="text-[11px] text-teal-400 font-semibold mt-0.5">TIP</Text>
            <Text className="text-[11px] text-white/50 flex-1 leading-4">{step.hint}</Text>
          </View>

          {/* Navigation */}
          <View className="flex-row items-center gap-3">
            {/* Prev button — only shown after first step */}
            {currentStep > 0 ? (
              <Pressable
                onPress={handlePrev}
                className="px-4 py-3 rounded-xl bg-white/5 active:bg-white/10"
                accessibilityLabel="Previous step"
                accessibilityRole="button"
              >
                <ChevronRight
                  size={18}
                  color={colors.textMuted}
                  style={{ transform: [{ rotate: '180deg' }] }}
                />
              </Pressable>
            ) : null}

            {/* Step dots */}
            <View className="flex-1 items-center">
              <StepDots total={DEMO_STEPS.length} current={currentStep} />
            </View>

            {/* Next / Finish button */}
            <Pressable
              onPress={handleNext}
              className="flex-row items-center gap-2 px-5 py-3 rounded-xl active:opacity-80"
              style={{ backgroundColor: colors.teal }}
              accessibilityLabel={isLast ? 'Finish walkthrough' : 'Next step'}
              accessibilityRole="button"
            >
              {isLast ? (
                <>
                  <CheckCircle2 size={16} color="#fff" />
                  <Text className="text-sm font-semibold text-white">Done</Text>
                </>
              ) : (
                <>
                  <Text className="text-sm font-semibold text-white">Next</Text>
                  <ChevronRight size={16} color="#fff" />
                </>
              )}
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
