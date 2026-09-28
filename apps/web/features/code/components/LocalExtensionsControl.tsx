'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sparkles } from '@agiworkforce/icons';
import { Popover, PopoverContent, PopoverTrigger, Spinner, Switch } from '@agiworkforce/ui';
import type { PluginSummary, SkillSummary } from '@agiworkforce/types/protocol';
import {
  listDeveloperPlugins,
  listDeveloperSkills,
  setDeveloperPluginEnabled,
  setDeveloperSkillConsent,
  setDeveloperSkillEnabled,
} from '@/features/desktop-host';
import { toUserMessage } from '@/lib/user-error-message';
import { LOCAL_CODE_COPY } from '../local-code';
import styles from '../CloudCodePage.module.css';

const GLYPH_SIZE = 16;
const POPOVER_WIDTH = 360;

interface Extensions {
  skills: SkillSummary[];
  plugins: PluginSummary[];
}

export function LocalExtensionsControl({ rootId }: { rootId: string }) {
  const [open, setOpen] = useState(false);
  const [extensions, setExtensions] = useState<Extensions | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [skills, plugins] = await Promise.all([
        listDeveloperSkills(rootId),
        listDeveloperPlugins(rootId),
      ]);
      setExtensions({ skills, plugins });
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.extensionsFailed));
    }
  }, [rootId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const change = async (update: () => Promise<unknown>) => {
    setSaving(true);
    setError(null);
    try {
      await update();
      await load();
    } catch (cause: unknown) {
      setError(toUserMessage(cause, LOCAL_CODE_COPY.extensionsUpdateFailed));
    } finally {
      setSaving(false);
    }
  };

  const projectSkills = extensions?.skills.filter((skill) => skill.scope === 'project') ?? [];
  const projectTrusted = projectSkills.every((skill) => skill.consented);
  const empty =
    extensions !== null && extensions.skills.length === 0 && extensions.plugins.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`${styles['headerButton']} ${open ? styles['headerButtonActive'] : ''}`}
          aria-label={LOCAL_CODE_COPY.extensions}
          title={LOCAL_CODE_COPY.extensions}
        >
          <Sparkles size={GLYPH_SIZE} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        style={{ width: POPOVER_WIDTH }}
        className="p-0"
        aria-label={LOCAL_CODE_COPY.extensions}
      >
        <div className={styles['popover']}>
          {error !== null && (
            <span className={styles['formHelp']} role="alert">
              {error}
            </span>
          )}

          {extensions === null && error === null && (
            <Spinner size="sm" aria-label={LOCAL_CODE_COPY.extensionsLoading} />
          )}

          {empty && <span className={styles['formHelp']}>{LOCAL_CODE_COPY.extensionsNone}</span>}

          {projectSkills.length > 0 && (
            <div className={styles['formField']}>
              {!projectTrusted && (
                <span className={styles['formHelp']}>{LOCAL_CODE_COPY.projectSkillsUntrusted}</span>
              )}
              <button
                type="button"
                className={styles['secondaryButton']}
                disabled={saving}
                onClick={() => void change(() => setDeveloperSkillConsent(rootId, !projectTrusted))}
              >
                {projectTrusted
                  ? LOCAL_CODE_COPY.revokeProjectSkills
                  : LOCAL_CODE_COPY.trustProjectSkills}
              </button>
            </div>
          )}

          {extensions !== null && extensions.skills.length > 0 && (
            <div className={styles['formField']}>
              <span className={styles['popoverHeading']}>{LOCAL_CODE_COPY.skillsHeading}</span>
              {extensions.skills.map((skill) => (
                <label key={`${skill.scope}:${skill.name}`} className={styles['extensionRow']}>
                  <span className={styles['menuRowLabel']}>
                    <span className={styles['optionLabel']}>{skill.name}</span>
                    <span className={styles['optionHint']}>
                      {`${LOCAL_CODE_COPY.skillScopeLabels[skill.scope]} · ${skill.description}`}
                    </span>
                  </span>
                  <Switch
                    checked={skill.enabled}
                    disabled={saving || !skill.consented}
                    aria-label={skill.name}
                    onCheckedChange={(enabled) =>
                      void change(() => setDeveloperSkillEnabled(rootId, skill.name, enabled))
                    }
                  />
                </label>
              ))}
            </div>
          )}

          {extensions !== null && extensions.plugins.length > 0 && (
            <div className={styles['formField']}>
              <span className={styles['popoverHeading']}>{LOCAL_CODE_COPY.pluginsHeading}</span>
              {extensions.plugins.map((plugin) => (
                <label key={plugin.id} className={styles['extensionRow']}>
                  <span className={styles['menuRowLabel']}>
                    <span className={styles['optionLabel']}>{plugin.name}</span>
                    {plugin.version && (
                      <span className={styles['optionHint']}>{plugin.version}</span>
                    )}
                  </span>
                  <Switch
                    checked={plugin.enabled}
                    disabled={saving}
                    aria-label={plugin.name}
                    onCheckedChange={(enabled) =>
                      void change(() => setDeveloperPluginEnabled(rootId, plugin.id, enabled))
                    }
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
