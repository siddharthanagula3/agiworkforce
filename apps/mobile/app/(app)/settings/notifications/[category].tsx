import { useLocalSearchParams } from 'expo-router';

import NotificationCategoryDetailScreen from '@/src/features/settings/notifications/NotificationCategoryDetailScreen';

export default function NotificationCategoryRoute() {
  const { category } = useLocalSearchParams<{ category?: string | string[] }>();

  return (
    <NotificationCategoryDetailScreen category={typeof category === 'string' ? category : ''} />
  );
}
