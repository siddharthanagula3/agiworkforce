import { useCallback, useMemo, useState } from 'react';
import { View, Alert } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { MessageCircle, Send, Hash } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { testConnection } from '@/services/messaging';
import { colors } from '@/lib/theme';
import type { MessagingPlatform } from '@/stores/messagingStore';

interface PlatformSetupSheetProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sheetRef: any;
  platform: MessagingPlatform | null;
  onConnect: (config: Record<string, string>) => Promise<void>;
}

const platformIcons: Record<
  MessagingPlatform['id'],
  { Icon: typeof MessageCircle; color: string }
> = {
  whatsapp: { Icon: MessageCircle, color: '#25D366' },
  telegram: { Icon: Send, color: '#0088cc' },
  slack: { Icon: Hash, color: '#7C3AED' },
};

export function PlatformSetupSheet({ sheetRef, platform, onConnect }: PlatformSetupSheetProps) {
  const snapPoints = useMemo(() => ['60%', '85%'], []);

  const [config, setConfig] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setConfig({});
    setTesting(false);
    setTestResult(null);
    setConnecting(false);
    setError(null);
  }, []);

  const handleTestConnection = useCallback(async () => {
    if (!platform) return;

    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const result = await testConnection(platform.id, config);
      setTestResult(result);
      if (!result.success) {
        setError(result.error ?? 'Connection test failed');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to test connection';
      setTestResult({ success: false, error: message });
      setError(message);
    } finally {
      setTesting(false);
    }
  }, [platform, config]);

  const handleConnect = useCallback(async () => {
    if (!platform) return;

    setConnecting(true);
    setError(null);

    try {
      await onConnect(config);
      resetState();
      sheetRef.current?.close();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect';
      setError(message);
    } finally {
      setConnecting(false);
    }
  }, [platform, config, onConnect, resetState, sheetRef]);

  const handleCancel = useCallback(() => {
    resetState();
    sheetRef.current?.close();
  }, [resetState, sheetRef]);

  const updateConfig = useCallback((key: string, value: string) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
        pressBehavior="close"
      />
    ),
    [],
  );

  if (!platform) return null;

  const { Icon, color } = platformIcons[platform.id] ?? {
    Icon: MessageCircle,
    color: colors.textMuted,
  };

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDynamicSizing={false}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.surfaceElevated }}
      handleIndicatorStyle={{
        backgroundColor: 'rgba(255,255,255,0.3)',
        width: 36,
      }}
      onChange={(index) => {
        if (index === -1) resetState();
      }}
    >
      <BottomSheetScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="items-center mb-6 pt-2">
          <View
            className="w-14 h-14 rounded-2xl items-center justify-center mb-3"
            style={{ backgroundColor: `${color}20` }}
          >
            <Icon size={28} color={color} />
          </View>
          <Text variant="heading">{platform.name}</Text>
          <Text className="text-sm text-white/50 mt-1 text-center">
            Enter your credentials to connect
          </Text>
        </View>

        {/* Platform-specific fields */}
        {platform.id === 'whatsapp' && (
          <View className="gap-4 mb-6">
            <Input
              label="Phone Number"
              placeholder="+1 (555) 000-0000"
              keyboardType="phone-pad"
              value={config.phone ?? ''}
              onChangeText={(v) => updateConfig('phone', v)}
              autoComplete="tel"
            />
            <Input
              label="Business API Key"
              placeholder="Enter your WhatsApp Business API key"
              value={config.apiKey ?? ''}
              onChangeText={(v) => updateConfig('apiKey', v)}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        {platform.id === 'telegram' && (
          <View className="gap-4 mb-6">
            <Input
              label="Bot Token"
              placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v"
              value={config.token ?? ''}
              onChangeText={(v) => updateConfig('token', v)}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        {platform.id === 'slack' && (
          <View className="gap-4 mb-6">
            <Input
              label="Workspace URL"
              placeholder="https://your-team.slack.com"
              value={config.workspaceUrl ?? ''}
              onChangeText={(v) => updateConfig('workspaceUrl', v)}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              title="Authorize with Slack"
              variant="outline"
              size="md"
              onPress={() => {
                Alert.alert(
                  'OAuth',
                  'Slack OAuth flow will open in your browser. This feature is coming soon.',
                );
              }}
              className="mt-1"
            />
          </View>
        )}

        {/* Error display */}
        {error && (
          <View className="bg-red-500/10 rounded-lg p-3 mb-4">
            <Text className="text-sm text-red-400">{error}</Text>
          </View>
        )}

        {/* Test result success */}
        {testResult?.success && (
          <View className="bg-emerald-500/10 rounded-lg p-3 mb-4">
            <Text className="text-sm text-emerald-400">Connection test successful</Text>
          </View>
        )}

        {/* Test Connection */}
        <Button
          title={testing ? 'Testing...' : 'Test Connection'}
          variant="outline"
          size="md"
          onPress={handleTestConnection}
          loading={testing}
          disabled={testing || connecting}
          className="mb-3"
        />

        {/* Connect */}
        <Button
          title={connecting ? 'Connecting...' : 'Connect'}
          variant="primary"
          size="lg"
          onPress={handleConnect}
          loading={connecting}
          disabled={testing || connecting}
          className="mb-3"
        />

        {/* Cancel */}
        <Button title="Cancel" variant="ghost" size="md" onPress={handleCancel} />
      </BottomSheetScrollView>
    </BottomSheet>
  );
}
