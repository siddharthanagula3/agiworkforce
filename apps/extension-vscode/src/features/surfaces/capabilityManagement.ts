import * as vscode from 'vscode';
import type {
  McpServerListResponse,
  PluginListResponse,
  SkillListResponse,
} from '@agiworkforce/types/protocol';
import { createSkill } from './skillAuthoring';
import {
  CLI_CAPABILITY_REQUIREMENT,
  type CliCapabilityAdapter,
  type CliCapabilityResult,
} from './cliCapabilities';

interface ManagedItem extends vscode.QuickPickItem {
  run?: () => Promise<CliCapabilityResult<unknown>>;
}

interface ManagedSurface {
  title: string;
  placeholder: string;
  empty: string;
  load: () => Promise<CliCapabilityResult<ManagedItem[]>>;
}

const MCP_STATUS_LABELS: Record<McpServerListResponse['servers'][number]['status'], string> = {
  configured: 'Configured',
  authorized: 'Signed in',
  needs_auth: 'Needs sign-in',
};

function unavailableLabel(reason: string, noun: string): string {
  return reason === CLI_CAPABILITY_REQUIREMENT ? `${reason} to manage ${noun}` : reason;
}

async function showManagedSurface(surface: ManagedSurface, noun: string): Promise<void> {
  const pick = vscode.window.createQuickPick<ManagedItem>();
  pick.title = surface.title;
  pick.placeholder = surface.placeholder;
  pick.matchOnDescription = true;
  pick.matchOnDetail = true;

  const render = async (): Promise<void> => {
    pick.busy = true;
    const result = await surface.load();
    pick.busy = false;
    if (result.status !== 'ok') {
      pick.items = [{ label: unavailableLabel(result.reason, noun), alwaysShow: true }];
      return;
    }
    pick.items =
      result.value.length === 0 ? [{ label: surface.empty, alwaysShow: true }] : result.value;
  };

  await new Promise<void>((resolve) => {
    pick.onDidAccept(async () => {
      const item = pick.selectedItems[0];
      if (item?.run === undefined) return;
      pick.busy = true;
      const outcome = await item.run();
      if (outcome.status !== 'ok') {
        void vscode.window.showErrorMessage(`AGI Workforce: ${outcome.reason}`);
      }
      await render();
    });
    pick.onDidHide(() => {
      pick.dispose();
      resolve();
    });
    pick.show();
    void render();
  });
}

function toggleLabel(name: string, enabled: boolean): string {
  return `$(${enabled ? 'pass-filled' : 'circle-large-outline'}) ${name}`;
}

export function manageSkills(adapter: CliCapabilityAdapter): Promise<void> {
  return showManagedSurface(
    {
      title: 'AGI Workforce, Skills',
      placeholder: 'Pick a skill to turn it on or off',
      empty: 'No skills are loaded in this workspace',
      load: async () => {
        const result = await adapter.call<SkillListResponse>('skills');
        if (result.status !== 'ok') return result;
        const items: ManagedItem[] = [
          {
            label: '$(add) Create a skill',
            detail: 'Write a new personal or project skill and open it to edit',
            run: async () => {
              await createSkill();
              return { status: 'ok', value: undefined };
            },
          },
        ];
        if (result.value.skills.some((skill) => !skill.consented)) {
          items.push({
            label: '$(shield) Allow this folder’s project skills',
            detail: 'Project skills load only after you allow them for this workspace',
            run: () => adapter.call('skillsConsent', true),
          });
        }
        for (const skill of result.value.skills) {
          items.push({
            label: toggleLabel(skill.name, skill.enabled && skill.consented),
            description: `${skill.scope}${skill.consented ? '' : ', not allowed yet'}`,
            detail: skill.description,
            run: () => adapter.call('skillsSetEnabled', skill.name, !skill.enabled),
          });
        }
        return { status: 'ok', value: items };
      },
    },
    'skills',
  );
}

export function managePlugins(adapter: CliCapabilityAdapter): Promise<void> {
  return showManagedSurface(
    {
      title: 'AGI Workforce, Plugins',
      placeholder: 'Pick a plugin to turn it on or off',
      empty: 'No plugins are installed. Install one with agi plugin install.',
      load: async () => {
        const result = await adapter.call<PluginListResponse>('plugins');
        if (result.status !== 'ok') return result;
        return {
          status: 'ok',
          value: result.value.plugins.map((plugin) => ({
            label: toggleLabel(plugin.name, plugin.enabled),
            description: [plugin.version, plugin.source].filter(Boolean).join(', '),
            detail: plugin.path,
            run: () => adapter.call('pluginsSetEnabled', plugin.id, !plugin.enabled),
          })),
        };
      },
    },
    'plugins',
  );
}

export function manageMcpServers(adapter: CliCapabilityAdapter): Promise<void> {
  return showManagedSurface(
    {
      title: 'AGI Workforce, MCP servers',
      placeholder: 'Pick a server that needs sign-in to sign in',
      empty: 'No MCP servers are configured. Add one with agi mcp add.',
      load: async () => {
        const result = await adapter.call<McpServerListResponse>('mcpServers');
        if (result.status !== 'ok') return result;
        return {
          status: 'ok',
          value: result.value.servers.map((server) => ({
            label: `$(${server.status === 'needs_auth' ? 'key' : 'plug'}) ${server.name}`,
            description: `${MCP_STATUS_LABELS[server.status]}, ${server.transport}, ${server.scope}`,
            ...(server.url === undefined ? {} : { detail: server.url }),
            ...(server.status === 'needs_auth'
              ? { run: () => adapter.call('mcpLogin', server.name) }
              : {}),
          })),
        };
      },
    },
    'MCP servers',
  );
}
