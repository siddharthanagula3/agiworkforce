import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { PluginDirectoryEntryWire } from '@agiworkforce/cloud-contracts';

import { showToast } from '@/src/shared/components/Toast';
import { confirmIrreversible } from '@/src/shared/components/cloud-screen';
import { pluginInstallPermissionsMessage } from './pluginsModel';
import {
  PluginDependentsError,
  installPlugin,
  pluginActionError,
  setPluginEnabled,
  uninstallPlugin,
} from './service';

export type PluginActionKind = 'install' | 'enabled' | 'uninstall';

export interface PluginActionPending {
  pluginId: string;
  kind: PluginActionKind;
}

interface PluginActionsOptions {
  onChanged: () => void | Promise<void>;
  onFailure: (message: string, entry: PluginDirectoryEntryWire) => void;
}

export function usePluginActions({ onChanged, onFailure }: PluginActionsOptions) {
  const [pending, setPending] = useState<PluginActionPending | null>(null);
  const running = useRef(false);

  const run = useCallback(async (next: PluginActionPending, work: () => Promise<boolean>) => {
    if (running.current) return false;
    running.current = true;
    setPending(next);
    try {
      return await work();
    } finally {
      running.current = false;
      setPending(null);
    }
  }, []);

  const install = useCallback(
    (entry: PluginDirectoryEntryWire) =>
      run({ pluginId: entry.id, kind: 'install' }, async () => {
        try {
          const result = await installPlugin(entry.id);
          const alsoInstalled = result.dependencies.map((dependency) => dependency.name);
          showToast(
            alsoInstalled.length > 0
              ? `Installed ${entry.name}. Also installed: ${alsoInstalled.join(', ')}.`
              : `Installed ${entry.name}`,
          );
          await onChanged();
          return true;
        } catch (error) {
          onFailure(pluginActionError(error, `Could not install ${entry.name}.`), entry);
          return false;
        }
      }),
    [onChanged, onFailure, run],
  );

  const requestInstall = useCallback(
    async (entry: PluginDirectoryEntryWire) => {
      if (entry.permissions.length > 0) {
        const accepted = await new Promise<boolean>((resolve) => {
          Alert.alert(
            `Install ${entry.name}?`,
            pluginInstallPermissionsMessage(entry.permissions),
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Install', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          );
        });
        if (!accepted) return false;
      }
      return install(entry);
    },
    [install],
  );

  const setEnabled = useCallback(
    (entry: PluginDirectoryEntryWire, enabled: boolean) =>
      run({ pluginId: entry.id, kind: 'enabled' }, async () => {
        try {
          await setPluginEnabled(entry.id, enabled);
          await onChanged();
          return true;
        } catch (error) {
          onFailure(
            pluginActionError(error, `Could not turn ${entry.name} ${enabled ? 'on' : 'off'}.`),
            entry,
          );
          return false;
        }
      }),
    [onChanged, onFailure, run],
  );

  const remove = useCallback(
    async (entry: PluginDirectoryEntryWire) => {
      const confirmed = await confirmIrreversible({
        title: `Remove ${entry.name}?`,
        consequence: `Its skills and agents stop loading in your Cloud chats and its settings are cleared. You can install it again later.`,
        actionLabel: 'Remove',
      });
      if (!confirmed) return false;
      return run({ pluginId: entry.id, kind: 'uninstall' }, async () => {
        try {
          await uninstallPlugin(entry.id);
          await onChanged();
          return true;
        } catch (error) {
          if (!(error instanceof PluginDependentsError)) {
            onFailure(pluginActionError(error, `Could not remove ${entry.name}.`), entry);
            return false;
          }
          const together = await confirmIrreversible({
            title: `Remove ${entry.name} and what needs it?`,
            consequence: `${error.message} Removing them together also removes ${error.dependents
              .map((dependent) => dependent.name)
              .join(', ')}.`,
            actionLabel: 'Remove all',
          });
          if (!together) return false;
          try {
            await uninstallPlugin(entry.id, true);
            await onChanged();
            return true;
          } catch (secondError) {
            onFailure(pluginActionError(secondError, `Could not remove ${entry.name}.`), entry);
            return false;
          }
        }
      });
    },
    [onChanged, onFailure, run],
  );

  return { pending, install, requestInstall, setEnabled, remove };
}
