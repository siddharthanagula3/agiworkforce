import { useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useNotificationStore } from '../store/notificationStore';
import { formatRelativeTime } from '../utils/time';

export function NotificationsScreen() {
  const { items, registerPush, registering, permissionGranted, markAsRead } =
    useNotificationStore();

  useEffect(() => {
    if (!permissionGranted && !registering) {
      void registerPush();
    }
  }, [permissionGranted, registering, registerPush]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Notifications</Text>
        <Text style={styles.permission}>
          {permissionGranted ? 'Push enabled' : 'Enable push to receive live alerts'}
        </Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => markAsRead(item.id)}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMeta}>{formatRelativeTime(item.timestamp)}</Text>
            </View>
            <Text style={styles.cardBody}>{item.body}</Text>
            {!item.read && <Text style={styles.unreadBadge}>new</Text>}
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No notifications yet. Activity will appear here.</Text>
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
    paddingVertical: 24,
  },
  header: {
    marginBottom: 16,
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0f172a',
  },
  permission: {
    color: '#64748b',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  cardMeta: {
    fontSize: 12,
    color: '#64748b',
  },
  cardBody: {
    color: '#0f172a',
  },
  unreadBadge: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    color: '#f8fafc',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyText: {
    color: '#94a3b8',
  },
});
