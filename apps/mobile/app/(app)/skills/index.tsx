/**
 * Expo route wrapper — /(app)/skills
 *
 * The implementation lives in the feature domain so the route directory stays
 * limited to navigation ownership.
 */
import { SkillsScreen } from '@/src/features/skills';

export default function SkillsRoute() {
  return <SkillsScreen />;
}
