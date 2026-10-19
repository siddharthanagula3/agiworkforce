import { useLocalSearchParams } from 'expo-router';
import { ProjectSettingsScreen } from '@/src/features/projects/components/ProjectSettingsScreen';

export default function ProjectSettingsRoute() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  return <ProjectSettingsScreen projectId={id ?? ''} />;
}
