import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export interface CommandBarAction {
  label: string;
  icon?: string;
  payload: Record<string, unknown>;
}

interface CommandBarProps {
  title?: string;
  actions: CommandBarAction[];
  onAction: (payload: Record<string, unknown>) => void;
}

export function CommandBar({ title = 'Quick actions', actions, onAction }: CommandBarProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>{title}</Text>
      <View style={styles.row}>
        {actions.map((action) => (
          <TouchableOpacity
            key={action.label}
            style={styles.action}
            onPress={() => onAction(action.payload)}
          >
            <Text style={styles.actionText}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f172a',
    padding: 16,
    borderRadius: 16,
  },
  heading: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 16,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  action: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
  },
  actionText: {
    color: '#f8fafc',
    fontWeight: '500',
  },
});
