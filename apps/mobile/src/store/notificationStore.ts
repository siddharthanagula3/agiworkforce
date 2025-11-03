import { create } from 'zustand';
import { registerForPushNotificationsAsync, scheduleLocalNotification } from '../services/notifications';

interface NotificationEntry {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
}

interface NotificationState {
  pushToken?: string;
  permissionGranted: boolean;
  registering: boolean;
  items: NotificationEntry[];
  registerPush: () => Promise<void>;
  addNotification: (entry: Omit<NotificationEntry, 'id' | 'read' | 'timestamp'> & { id?: string; read?: boolean }) => void;
  markAsRead: (id: string) => void;
  clear: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  permissionGranted: false,
  registering: false,
  items: [],
  async registerPush() {
    set({ registering: true });
    try {
      const result = await registerForPushNotificationsAsync();
      if (result.granted) {
        set({ pushToken: result.token, permissionGranted: true, registering: false });
      } else {
        set({ permissionGranted: false, registering: false });
      }
    } catch {
      set({ registering: false, permissionGranted: false });
    }
  },
  addNotification(entry) {
    const id = entry.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const notification: NotificationEntry = {
      id,
      title: entry.title,
      body: entry.body,
      timestamp: Date.now(),
      read: entry.read ?? false,
    };
    set((state) => ({
      items: [notification, ...state.items].slice(0, 50),
    }));
    // Also reflect locally
    scheduleLocalNotification(entry.title, entry.body).catch(() => {
      // ignore scheduling errors
    });
  },
  markAsRead(id) {
    set((state) => ({
      items: state.items.map((n) => (n.id === id ? { ...n, read: true } : n)),
    }));
  },
  clear() {
    set({ items: [] });
  },
}));
