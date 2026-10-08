import type { Skill } from '@agiworkforce/skills';

const FRONTMATTER_WORKSPACE_PLUGIN_KEY = 'workspace_plugin';

export function workspacePluginFrontmatter(pluginName: string): Record<string, string> {
  return { [FRONTMATTER_WORKSPACE_PLUGIN_KEY]: pluginName };
}

export function workspacePluginNameOf(skill: Skill): string | null {
  const name = skill.frontmatter[FRONTMATTER_WORKSPACE_PLUGIN_KEY];
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
}
