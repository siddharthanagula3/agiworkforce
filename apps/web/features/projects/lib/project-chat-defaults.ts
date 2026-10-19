import type { ProjectChatDefaults } from '@agiworkforce/cloud-contracts';
import type { ComposerToggleState } from '@shared/stores/web-chat-store';

export type ProjectComposerToggles = Partial<
  Pick<ComposerToggleState, 'codeExecutionEnabled' | 'researchEnabled' | 'selectedSkillName'>
>;

export function composerTogglesFromProjectDefaults(
  defaults: ProjectChatDefaults | null | undefined,
): ProjectComposerToggles | null {
  if (!defaults) return null;
  const toggles: ProjectComposerToggles = {};
  if (defaults.codeExecution) toggles.codeExecutionEnabled = true;
  if (defaults.research) toggles.researchEnabled = true;
  if (defaults.skillName) toggles.selectedSkillName = defaults.skillName;
  return Object.keys(toggles).length > 0 ? toggles : null;
}

export function sameProjectChatDefaults(
  a: ProjectChatDefaults | null | undefined,
  b: ProjectChatDefaults | null | undefined,
): boolean {
  return (
    Boolean(a?.codeExecution) === Boolean(b?.codeExecution) &&
    Boolean(a?.research) === Boolean(b?.research) &&
    (a?.skillName ?? null) === (b?.skillName ?? null)
  );
}
