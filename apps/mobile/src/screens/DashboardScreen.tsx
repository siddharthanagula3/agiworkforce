
import { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useDeviceStore } from '../store/deviceStore';
import { useSyncStore } from '../store/syncStore';
import { formatRelativeTime } from '../utils/time';

export function DashboardScreen() {
  const { devices, fetchDevices, loading } = useDeviceStore();
  const { records, pull, syncing } = useSyncStore();

  useEffect(() => {
    void fetchDevices();
    void pull();
  }, [fetchDevices, pull]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Linked desktops</Text>
      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.deviceRow}
        renderItem={({ item }) => (
          <View style={[styles.deviceCard, item.online ? styles.online : styles.offline]}>
            <Text style={styles.deviceName}>{item.name}</Text>
            <Text style={styles.deviceMeta}>{item.platform}</Text>
            <Text style={styles.deviceMeta}>v{item.version}</Text>
            <Text style={styles.deviceStatus}>
              {item.online ? 'Online' : `Last seen ${formatRelativeTime(item.lastSeen)}`}
            </Text>
          </View>
        )}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => fetchDevices()} tintColor="#38bdf8" />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No desktops connected yet. Pair your desktop to mirror workflows here.
            </Text>
          </View>
        }
      />

      <Text style={styles.heading}>Recent activity</Text>
      <FlatList
        data={[...records].reverse()}
        keyExtractor={(item) => `${item.timestamp}-${item.type}`}
        renderItem={({ item }) => (
          <View style={styles.timelineCard}>
            <Text style={styles.timelineTitle}>{item.type}</Text>
            <Text style={styles.timelineMeta}>{formatRelativeTime(item.timestamp)}</Text>
            <Text style={styles.timelinePayload}>{JSON.stringify(item.data, null, 2)}</Text>
          </View>
        )}
        refreshControl={
          <RefreshControl refreshing={syncing} onRefresh={() => pull()} tintColor="#38bdf8" />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>
              No sync activity yet. Actions from desktop will appear here instantly.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    gap: 16,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
  },
  deviceRow: {
    gap: 12,
  },
  deviceCard: {
    width: 220,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#1f2937',
  },
  online: {
    backgroundColor: '#1e3a8a',
  },
  offline: {
    backgroundColor: '#334155',
  },
  deviceName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f8fafc',
  },
  deviceMeta: {
    fontSize: 14,
    color: '#cbd5f5',
  },
  deviceStatus: {
    fontSize: 12,
    color: '#bae6fd',
    marginTop: 8,
  },
  emptyState: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    color: '#64748b',
    textAlign: 'center',
  },
  timelineCard: {
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  timelineTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  timelineMeta: {
    fontSize: 12,
    color: '#64748b',
  },
  timelinePayload: {
    marginTop: 8,
    color: '#0f172a',
    fontFamily: 'Courier New',
    fontSize: 12,
  },
});
