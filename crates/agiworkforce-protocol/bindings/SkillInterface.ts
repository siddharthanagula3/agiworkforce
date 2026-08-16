import type { AbsolutePathBuf } from './AbsolutePathBuf';

export type SkillInterface = {
  display_name?: string;
  short_description?: string;
  icon_small?: AbsolutePathBuf;
  icon_large?: AbsolutePathBuf;
  brand_color?: string;
  default_prompt?: string;
};
