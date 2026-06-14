import { View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AlertTriangle, RotateCcw } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useThemeColors } from '@/src/ui/theme';

interface ErrorBoundaryProps {
  error: Error;
  retry: () => void;
}

export default function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const router = useRouter();
  const colors = useThemeColors();

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.surfaceBase }}>
      <View className="flex-1 items-center justify-center px-8">
        <View
          className="w-20 h-20 rounded-2xl items-center justify-center mb-5"
          style={{ backgroundColor: colors.dangerSurface }}
        >
          <AlertTriangle size={36} color={colors.agentError} />
        </View>

        <Text variant="heading" className="text-center mb-2">
          Something went wrong
        </Text>
        <Text
          className="text-center text-sm mb-2 leading-5"
          style={{ color: colors.textSecondary }}
        >
          An unexpected error occurred. Please try again.
        </Text>
        <Text
          className="text-center text-xs mb-8 leading-4"
          style={{ color: colors.textMuted }}
          numberOfLines={3}
        >
          {error.message}
        </Text>

        <Pressable
          onPress={retry}
          className="flex-row items-center gap-2 px-6 py-3 rounded-xl active:opacity-80 mb-3"
          style={{ backgroundColor: colors.teal }}
          accessibilityLabel="Retry"
          accessibilityRole="button"
        >
          <RotateCcw size={18} color={colors.accentText} />
          <Text className="text-sm font-semibold" style={{ color: colors.accentText }}>
            Try Again
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(app)' as Parameters<typeof router.replace>[0]);
          }}
          className="px-6 py-2 rounded-lg"
          style={({ pressed }) => ({
            backgroundColor: pressed ? colors.surfaceHover : colors.transparent,
          })}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text className="text-sm" style={{ color: colors.textMuted }}>
            Go Back
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
