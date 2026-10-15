/**
 * Variables the CLI reads to run without its sandbox or to lift one of its
 * own guards: the sandbox and its two opt-outs, unsafe PowerShell, an agent
 * peer on a private address or reading local files, credentials kept in a
 * plain file, and audio sent to a cloud service. A person sets them for a terminal; an app started from a shell
 * or a launch agent that carried one would hand it to every session, and no
 * one at this computer would have chosen that. The app never passes them on.
 */
export const GUARD_LIFTING_ENVIRONMENT: readonly string[] = [
  'AGIWORKFORCE_NO_SANDBOX',
  'AGIWORKFORCE_SANDBOX_HOOKS',
  'AGIWORKFORCE_SANDBOX_MCP',
  'AGI_POWERSHELL_ALLOW_UNSAFE',
  'AGI_A2A_ALLOW_PRIVATE',
  'AGI_A2A_ALLOW_FILE_READS',
  'AGIWORKFORCE_NO_KEYRING',
  'AGIWORKFORCE_VOICE_ALLOW_CLOUD',
];

export function withoutGuardLifting(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([name]) => !GUARD_LIFTING_ENVIRONMENT.includes(name.toUpperCase()),
    ),
  );
}
