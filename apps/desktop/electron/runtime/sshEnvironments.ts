import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import {
  type SshEnvironment,
  type SshEnvironmentInput,
  type WorkspaceRoot,
} from '@agiworkforce/local-runtime-contract';

const execute = promisify(execFile);
const connections = new Map<
  string,
  {
    input: SshEnvironmentInput;
    hostname: string;
    user: string;
    port: number;
    configDigest: string;
    identityFiles: string[];
    identitiesOnly: boolean;
    identityAgent: string | null;
    knownHostsFiles: string | null;
    workspaceKey: string | null;
  }
>();
const SSH_PROGRAM = '/usr/bin/ssh';
const LOCKED_OPTIONS = [
  '-oBatchMode=yes',
  '-oStrictHostKeyChecking=yes',
  '-oForwardAgent=no',
  '-oForwardX11=no',
  '-oClearAllForwardings=yes',
  '-oPermitLocalCommand=no',
  '-oControlMaster=no',
  '-oControlPath=none',
  '-oConnectTimeout=10',
  '-oServerAliveInterval=15',
  '-oServerAliveCountMax=2',
  '-oUpdateHostKeys=no',
];

export function validateSshEnvironment(value: unknown): SshEnvironmentInput {
  if (!value || typeof value !== 'object')
    throw new Error('Choose an SSH host and project folder.');
  const input = value as SshEnvironmentInput;
  if (
    typeof input.hostAlias !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/.test(input.hostAlias)
  )
    throw new Error('Use an SSH config alias or hostname without shell syntax.');
  if (
    typeof input.remotePath !== 'string' ||
    !input.remotePath.startsWith('/') ||
    !input.remotePath.replace(/\/+$/, '') ||
    input.remotePath.length > 1024 ||
    input.remotePath.split('/').includes('..') ||
    [...input.remotePath].some((character) => (character.codePointAt(0) ?? 0) < 32)
  )
    throw new Error('Choose an absolute Unix project path, excluding the filesystem root.');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200)
    throw new Error('Name this SSH connection.');
  return {
    hostAlias: input.hostAlias,
    remotePath: input.remotePath.replace(/\/+$/, ''),
    name: input.name.trim(),
  };
}
function idFor(input: SshEnvironmentInput, configDigest: string): string {
  return (
    'ssh:' +
    createHash('sha256')
      .update(input.hostAlias + '\0' + input.remotePath + '\0' + configDigest)
      .digest('hex')
  );
}
export function sshEnvironmentProcessEnv(): NodeJS.ProcessEnv {
  const allowed = ['HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'SSH_AUTH_SOCK'];
  return {
    PATH: '/usr/bin:/bin',
    ...Object.fromEntries(
      allowed.flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])),
    ),
  };
}
async function describe(input: SshEnvironmentInput) {
  if (process.platform === 'win32')
    throw new Error('SSH coding environments currently require macOS or Linux.');
  const result = await execute(SSH_PROGRAM, [...LOCKED_OPTIONS, '-G', '--', input.hostAlias], {
    timeout: 5000,
    maxBuffer: 128 * 1024,
    env: sshEnvironmentProcessEnv(),
    windowsHide: true,
  });
  const fields = new Map(
    result.stdout.split('\n').map((line) => {
      const at = line.indexOf(' ');
      return [line.slice(0, at), line.slice(at + 1).trim()];
    }),
  );
  if (
    [fields.get('proxyjump'), fields.get('proxycommand')].some((value) => value && value !== 'none')
  )
    throw new Error(
      'Jump hosts and proxy commands are unsupported for this SSH environment. No direct fallback was attempted.',
    );
  if (fields.get('remotecommand') && fields.get('remotecommand') !== 'none')
    throw new Error('SSH profiles with a custom RemoteCommand are unsupported.');
  const hostname = fields.get('hostname') ?? '';
  const user = fields.get('user') ?? '';
  const port = Number(fields.get('port'));
  const invalidIdentity = (value: string) =>
    [...value].some(
      (character) =>
        /\s/.test(character) ||
        (character.codePointAt(0) ?? 0) < 32 ||
        character.codePointAt(0) === 127,
    );
  if (
    !hostname ||
    hostname.startsWith('-') ||
    invalidIdentity(hostname) ||
    !user ||
    invalidIdentity(user) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    throw new Error('The SSH profile did not resolve to a valid host, user and port.');
  return {
    hostname,
    user,
    port,
    identityFiles: result.stdout
      .split('\n')
      .filter((line) => line.startsWith('identityfile '))
      .map((line) => line.slice('identityfile '.length).trim())
      .filter((value) => value),
    knownHostsFiles: fields.get('userknownhostsfile') ?? null,
    identitiesOnly: fields.get('identitiesonly') === 'yes',
    identityAgent: fields.get('identityagent') ?? null,
    configDigest: createHash('sha256').update(result.stdout).digest('hex'),
  };
}
export async function admitSshEnvironment(value: unknown): Promise<WorkspaceRoot> {
  const input = validateSshEnvironment(value);
  const resolved = await describe(input);
  const id = idFor(input, resolved.configDigest);
  const previous = connections.get(id);
  connections.set(id, {
    input,
    ...resolved,
    workspaceKey: previous?.configDigest === resolved.configDigest ? previous.workspaceKey : null,
  });
  return requireSshRoot(id);
}
export function requireSshRoot(id: string): WorkspaceRoot {
  const connection = connections.get(id);
  if (!connection)
    throw new Error('Reconnect and allow this SSH environment at this computer first.');
  return {
    id,
    path: connection.input.remotePath,
    name: `${connection.input.name} (SSH: ${connection.hostname})`,
    grantedAtMs: 0,
    lastOpenedAtMs: 0,
  };
}
export function hasSshEnvironment(id: string): boolean {
  return connections.has(id);
}
export function listSshRoots(): WorkspaceRoot[] {
  return [...connections.keys()].map(requireSshRoot);
}
export function listSshEnvironments(): SshEnvironment[] {
  return [...connections].map(([id, connection]) => ({
    id,
    ...connection.input,
    authorized: true,
    capabilities: {
      sessions: true,
      approvals: true,
      reconnect: true,
      agentFileTools: true,
      transcriptDiffs: true,
      hostFileEditor: false,
      pty: false,
      worktreeManagement: false,
      passwordPrompts: false,
      jumpHosts: false,
    },
  }));
}
export function forgetSshEnvironment(id: string): void {
  connections.delete(id);
}
function quote(value: string): string {
  return "'" + value.replace(/'/g, "'\"'\"'") + "'";
}
export async function sshLaunch(
  id: string,
): Promise<{ program: string; args: string[]; env: NodeJS.ProcessEnv }> {
  const connection = connections.get(id);
  if (!connection) throw new Error('This SSH environment is disconnected.');
  const current = await describe(connection.input);
  if (connections.get(id) !== connection)
    throw new Error('The SSH launch was cancelled or replaced.');
  if (current.configDigest !== connection.configDigest)
    throw new Error(
      'The SSH profile changed. Disconnect and review this environment before reconnecting.',
    );
  return {
    program: SSH_PROGRAM,
    args: [
      '-F',
      '/dev/null',
      ...LOCKED_OPTIONS,
      ...current.identityFiles.flatMap((file) =>
        file === 'none' ? ['-oIdentityFile=none'] : ['-i', file],
      ),
      `-oIdentitiesOnly=${current.identitiesOnly ? 'yes' : 'no'}`,
      ...(current.identityAgent ? [`-oIdentityAgent=${current.identityAgent}`] : []),
      ...(current.knownHostsFiles ? [`-oUserKnownHostsFile=${current.knownHostsFiles}`] : []),
      '-T',
      '-l',
      current.user,
      '-p',
      String(current.port),
      '--',
      current.hostname,
      `cd -- ${quote(connection.input.remotePath)} && exec agi app-server`,
    ],
    env: sshEnvironmentProcessEnv(),
  };
}
export function verifySshWorkspace(id: string, value: unknown): void {
  const connection = connections.get(id);
  if (!connection || !value || typeof value !== 'object')
    throw new Error('The SSH environment returned no workspace identity.');
  const identity = value as { cwd?: unknown; rootKey?: unknown };
  if (
    identity.cwd !== connection.input.remotePath ||
    typeof identity.rootKey !== 'string' ||
    !identity.rootKey ||
    identity.rootKey.length > 200
  )
    throw new Error(
      'The remote workspace resolves elsewhere or has no verifiable identity. Use its canonical project path.',
    );
  if (connection.workspaceKey !== null && identity.rootKey !== connection.workspaceKey)
    throw new Error(
      'The remote project directory changed identity. Disconnect and review it before reconnecting.',
    );
  connection.workspaceKey = identity.rootKey;
}
