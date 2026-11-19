import { skillTurnTools, type SkillTurnTools } from '@/src/features/skills/skillRequirements';

function requiredToolsOf(selection: unknown): readonly string[] | undefined {
  if (!selection || typeof selection !== 'object') return undefined;
  const tools = (selection as { requiredTools?: unknown }).requiredTools;
  return Array.isArray(tools) && tools.every((tool) => typeof tool === 'string')
    ? (tools as string[])
    : undefined;
}

export function selectedSkillTools(selection: unknown): SkillTurnTools {
  return skillTurnTools(requiredToolsOf(selection));
}
