import { useEffect, useMemo, useState } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StatusBar,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import { AuthScreen } from './screens/AuthScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { RemoteControlScreen } from './screens/RemoteControlScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { useAuthStore } from './store/authStore';
import { useDeviceStore } from './store/deviceStore';
import { useSyncStore } from './store/syncStore';
import { useNotificationStore } from './store/notificationStore';
import { createGatewayClient } from './services/websocket';
import { mobileService, type RegisterMobilePayload } from './services/mobile';

const DEVICE_ID_KEY = 'agiworkforce.mobile.deviceId';

type MainTab = 'overview' | 'remote' | 'activity' | 'settings';

export default function App() {
  const { status, hydrate, token, deviceId } = useAuthStore();
  const { fetchDevices } = useDeviceStore();
  const { pull, appendRecord } = useSyncStore();
  const notificationStore = useNotificationStore();
  const [tab, setTab] = useState<MainTab>('overview');
  const [gatewayConnected, setGatewayConnected] = useState(false);

  useEffect(() => {
    void hydrate();
    void ensureDeviceId();
  }, [hydrate]);

  useEffect(() => {
    if (token) {
      void fetchDevices();
      void pull();
    }
  }, [token, fetchDevices, pull]);

  useEffect(() => {
    if (!token) {
      setGatewayConnected(false);
      return;
    }

    let cancelled = false;
    let gateway: ReturnType<typeof createGatewayClient> | undefined;

    const connect = async () => {
      const clientId = await ensureDeviceId();
      if (cancelled) return;

      await registerMobileDevice(token, clientId, notificationStore.pushToken);

      gateway = createGatewayClient({
        token,
        deviceId: clientId,
        onEvent(event) {
          switch (event.type) {
            case 'auth_success':
              setGatewayConnected(true);
              break;
            case 'auth_error':
            case 'error':
              setGatewayConnected(false);
              break;
            case 'command':
              notificationStore.addNotification({
                title: 'Desktop command executed',
                body: JSON.stringify(event.payload),
              });
              break;
            case 'sync':
              appendRecord({
                userId: 'self',
                type: 'gateway_sync',
                data: { payload: event.payload },
                timestamp: Date.now(),
                deviceId: event.from ?? 'desktop',
              });
              break;
            case 'pong':
            default:
              break;
          }
        },
      });
    };

    void connect();
    return () => {
      cancelled = true;
      gateway?.disconnect();
    };
  }, [token, appendRecord, notificationStore]);

  useEffect(() => {
    const currentToken = token;
    const currentDeviceId = deviceId;
    const pushToken = notificationStore.pushToken;
    if (!currentToken || !currentDeviceId || !pushToken) {
      return;
    }
    void mobileService.updatePushToken(currentToken, {
      deviceId: currentDeviceId,
      pushToken,
    });
  }, [token, deviceId, notificationStore.pushToken]);

  const mainContent = useMemo(() => {
    switch (tab) {
      case 'overview':
        return <DashboardScreen />;
      case 'remote':
        return <RemoteControlScreen />;
      case 'activity':
        return <NotificationsScreen />;
      case 'settings':
        return <SettingsScreen />;
      default:
        return null;
    }
  }, [tab]);

  if (status === 'idle') {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#38bdf8" />
      </SafeAreaView>
    );
  }

  if (status !== 'authenticated') {
    return (
      <SafeAreaView style={styles.authContainer}>
        <StatusBar barStyle="light-content" />
        <AuthFlow />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.appContainer}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.appTitle}>AGI Workforce Companion</Text>
        <Text style={styles.connection}>
          {gatewayConnected ? 'Live connection active' : 'Connecting to gateway...'}
        </Text>
      </View>
      <View style={styles.tabBar}>
        <TabButton
          label="Overview"
          active={tab === 'overview'}
          onPress={() => setTab('overview')}
        />
        <TabButton label="Remote" active={tab === 'remote'} onPress={() => setTab('remote')} />
        <TabButton
          label="Activity"
          active={tab === 'activity'}
          onPress={() => setTab('activity')}
        />
        <TabButton
          label="Settings"
          active={tab === 'settings'}
          onPress={() => setTab('settings')}
        />
      </View>
      <View style={styles.body}>{mainContent}</View>
    </SafeAreaView>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.tabButton, active && styles.tabButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.tabButtonLabel, active && styles.tabButtonLabelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function AuthFlow() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  return <AuthScreen mode={mode} onModeChange={setMode} />;
}

async function ensureDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) {
    useAuthStore.getState().setDeviceId(existing);
    return existing;
  }
  const generated = `mobile-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, generated);
  useAuthStore.getState().setDeviceId(generated);
  return generated;
}

async function registerMobileDevice(token: string, deviceId: string, pushToken: string | null) {
  try {
    const payload: RegisterMobilePayload = {
      clientId: deviceId,
      name: Device.deviceName ?? 'Mobile Companion',
      platform: Device.osName ?? 'unknown',
    };
    if (pushToken) {
      payload.pushToken = pushToken;
    }
    await mobileService.register(token, payload);
  } catch (error) {
    console.warn('Failed to register mobile device', error);
  }
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  appContainer: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
  },
  connection: {
    fontSize: 12,
    color: '#64748b',
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
  },
  tabButtonActive: {
    backgroundColor: '#2563eb',
  },
  tabButtonLabel: {
    textAlign: 'center',
    color: '#0f172a',
    fontWeight: '600',
  },
  tabButtonLabelActive: {
    color: '#f8fafc',
  },
  body: {
    flex: 1,
  },
});
