import type { AbsolutePathBuf } from './AbsolutePathBuf';
import type { SkillDependencies } from './SkillDependencies';
import type { SkillInterface } from './SkillInterface';
import type { SkillScope } from './SkillScope';

export type SkillMetadata = {
  name: string;
  description: string;
  short_description?: string;
  interface?: SkillInterface;
  dependencies?: SkillDependencies;
  path: AbsolutePathBuf;
  scope: SkillScope;
  enabled: boolean;
};
