const NO_SKILL_NAMES: ReadonlySet<string> = new Set();

class EnabledPluginIds extends Set<string> {
  readonly disabledSkillNames: ReadonlySet<string>;

  constructor(pluginIds: Iterable<string>, disabledSkillNames: Iterable<string> = []) {
    super(pluginIds);
    this.disabledSkillNames = new Set(disabledSkillNames);
  }
}

export function disabledPluginSkillNames(
  enabledPluginIds: ReadonlySet<string>,
): ReadonlySet<string> {
  return enabledPluginIds instanceof EnabledPluginIds
    ? enabledPluginIds.disabledSkillNames
    : NO_SKILL_NAMES;
}

export function withDisabledPluginSkills(
  pluginIds: Iterable<string>,
  disabledSkillNames: readonly string[],
): Set<string> {
  return disabledSkillNames.length === 0
    ? new Set(pluginIds)
    : new EnabledPluginIds(pluginIds, disabledSkillNames);
}
